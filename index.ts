#!/usr/bin/env bun
/**
 * merc — Mercury 2 coding agent CLI
 * Usage: merc [prompt]
 *   Interactive mode: just run `merc`
 *   One-shot mode:    merc "explain diffusion models"
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import chalk from "chalk";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, execFileSync } from "node:child_process";
import { diffLines } from "diff";

// ── Version ─────────────────────────────────────────────────────────────────
const VERSION = "1.3.0";

// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG_DIR = path.join(os.homedir(), ".config", "merc");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const HISTORY_FILE = path.join(CONFIG_DIR, "history");
const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const BASE_URL = "https://api.inceptionlabs.ai/v1";
const CWD = process.cwd();
const MAX_RETRIES = 3;
const COLS = process.stdout.columns || 80;

interface MercConfig {
  api_key: string;
  model?: string;
}

const cachedConfig = (() => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as MercConfig;
  } catch {
    return null;
  }
})();

function loadConfig(): MercConfig | null {
  return cachedConfig;
}

function saveConfig(config: MercConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

async function askForKey(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  console.log();
  ui.header("Mercury — first-time setup");
  ui.dim("Get your API key at https://platform.inceptionlabs.ai");
  console.log();
  return new Promise((resolve) => {
    rl.question(chalk.yellow("  API key: "), (key) => {
      rl.close();
      resolve(key.trim());
    });
  });
}

async function getApiKey(): Promise<string> {
  if (process.env.INCEPTION_API_KEY) return process.env.INCEPTION_API_KEY;
  const config = loadConfig();
  if (config?.api_key) return config.api_key;
  const key = await askForKey();
  if (!key) {
    console.error(chalk.red("  No API key provided."));
    process.exit(1);
  }
  saveConfig({ api_key: key });
  ui.success(`Key saved to ${CONFIG_FILE}`);
  return key;
}

const DEFAULT_MODEL =
  process.env.MERCURY_MODEL ?? cachedConfig?.model ?? "mercury-2";

const SYSTEM_PROMPT = `You are Mercury, an ultra-fast AI coding agent powered by Inception Labs' diffusion LLM.
You have tools to read, edit, write, delete, rename files, list directories, search code, and run shell commands.

Current working directory: ${CWD}

When modifying code:
- Prefer edit_file (surgical find-and-replace) over write_file (full overwrite)
- Only use write_file for new files or complete rewrites
- The user will see a diff and must approve before any file changes are applied

When the user asks you to review, modify, or understand code:
1. Use list_directory and read_file to explore the codebase
2. Use grep_search to find specific patterns
3. Use edit_file or write_file to make changes
4. Use run_command to run tests, builds, etc.

Be concise, helpful, and direct. When making changes, show what you changed and why.
Always use absolute paths based on the current working directory.

Formatting rules for terminal output:
- Use bullet lists instead of tables for reviews, recommendations, or any content with long descriptions.
- Only use tables for short, structured data (3-5 word cells max).
- Use **bold** for emphasis and \`code\` for identifiers.`;

// ── TUI helpers ─────────────────────────────────────────────────────────────
const BAR = chalk.dim("│");
const BORDER_COLOR = chalk.dim;

const ui = {
  // Horizontal rule
  hr: () => console.log(BORDER_COLOR("─".repeat(Math.min(COLS, 80)))),

  // Thin separator
  sep: () => console.log(BORDER_COLOR("·".repeat(Math.min(COLS, 60)))),

  // Header text
  header: (text: string) => {
    console.log(chalk.cyan.bold(`  ${text}`));
  },

  // Dimmed info
  dim: (text: string) => console.log(chalk.dim(`  ${text}`)),

  // Success message
  success: (text: string) => console.log(chalk.green(`  ✓ ${text}`)),

  // Error message
  error: (text: string) => console.log(chalk.red(`  ✗ ${text}`)),

  // Warning/prompt
  warn: (text: string) => console.log(chalk.yellow(`  ${text}`)),

  // Response block — renders content with a left border accent
  response: (text: string) => {
    const maxW = COLS - 4; // account for "│ " prefix + margin
    // Collapse runs of 2+ blank lines into 1
    const collapsed = text.replace(/\n{3,}/g, "\n\n");
    // Remove blank lines between list items (tighten bullet lists)
    const tightened = collapsed.replace(/\n\n(\s*[*\-•])/g, "\n$1");
    const lines = tightened.split("\n");
    for (const line of lines) {
      // Strip ANSI to measure visible length
      const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
      if (visible.length <= maxW || maxW < 20) {
        console.log(`${chalk.cyan("│")} ${line}`);
      } else {
        // Hard-wrap long lines at word boundaries
        const words = line.split(/( +)/);
        let current = "";
        let currentLen = 0;
        for (const word of words) {
          const wordLen = word.replace(/\x1b\[[0-9;]*m/g, "").length;
          if (currentLen + wordLen > maxW && currentLen > 0) {
            console.log(`${chalk.cyan("│")} ${current}`);
            current = word.trimStart();
            currentLen = current.replace(/\x1b\[[0-9;]*m/g, "").length;
          } else {
            current += word;
            currentLen += wordLen;
          }
        }
        if (current) {
          console.log(`${chalk.cyan("│")} ${current}`);
        }
      }
    }
  },

  // Tool call indicator
  tool: (label: string) => {
    console.log(`${chalk.dim("├")} ${chalk.dim("◆")} ${chalk.dim(label)}`);
  },

  // Tool result (compact)
  toolResult: (text: string) => {
    const lines = text.split("\n").slice(0, 3);
    for (const line of lines) {
      const trimmed = line.length > 120 ? line.slice(0, 120) + "…" : line;
      console.log(`${chalk.dim("│")}   ${chalk.dim(trimmed)}`);
    }
    const totalLines = text.split("\n").length;
    if (totalLines > 3) {
      console.log(`${chalk.dim("│")}   ${chalk.dim(`… ${totalLines - 3} more lines`)}`);
    }
  },

  // Tool block end
  toolEnd: () => {
    console.log(chalk.dim("│"));
  },
};

// ── Spinner ─────────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;

function startSpinner(msg = "thinking") {
  let i = 0;
  spinnerInterval = setInterval(() => {
    const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
    process.stdout.write(`\r${chalk.cyan(frame)} ${chalk.dim(msg)}`);
    i++;
  }, 80);
}

function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write("\r\x1b[2K");
  }
}

// ── Markdown renderer ───────────────────────────────────────────────────────
const terminalOpts = markedTerminal({
  reflowText: true,
  width: Math.min(COLS - 6, 90), // leave room for │ border prefix
  tab: 2,
}) as any;

const originalRenderer = terminalOpts.renderer ?? {};
originalRenderer.table = (token: any): string => {
  const rows: string[][] = [];
  const headers: string[] = [];

  // Strip markdown formatting for clean terminal display
  const stripMd = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .trim();

  if (token.header) {
    for (const cell of token.header) {
      const text =
        cell.tokens?.map((t: any) => t.raw ?? t.text ?? "").join("") ?? "";
      headers.push(stripMd(text));
    }
  }
  if (token.rows) {
    for (const row of token.rows) {
      const cells: string[] = [];
      for (const cell of row) {
        const text =
          cell.tokens?.map((t: any) => t.raw ?? t.text ?? "").join("") ?? "";
        cells.push(stripMd(text));
      }
      rows.push(cells);
    }
  }

  const colCount = Math.max(headers.length, ...rows.map((r) => r.length));
  const maxTableWidth = Math.min(COLS - 6, 100); // leave room for left border

  // Check if any cell is "long" — if so, switch to list/card layout
  const longestCell = Math.max(
    0,
    ...headers.map((h) => h.length),
    ...rows.flatMap((r) => r.map((c) => c.length))
  );

  // Card layout for wide tables
  if (longestCell > 60 || colCount > 4) {
    let out = "\n";
    for (let ri = 0; ri < rows.length; ri++) {
      if (ri > 0) out += chalk.dim("  ·  ·  ·") + "\n";
      for (let ci = 0; ci < colCount; ci++) {
        const label = headers[ci] || `Col ${ci + 1}`;
        const value = rows[ri]?.[ci] || "";
        if (!value) continue;
        out += `  ${chalk.cyan(label)}: ${value}\n`;
      }
    }
    return out + "\n";
  }

  // Standard table for compact data
  const widths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    const headerW = headers[i]?.length ?? 0;
    const maxCellW = Math.max(0, ...rows.map((r) => (r[i]?.length ?? 0)));
    widths.push(Math.max(headerW, maxCellW) + 2);
  }

  // Shrink columns proportionally if table is too wide
  const totalW = widths.reduce((a, b) => a + b, 0) + (colCount - 1) * 3;
  if (totalW > maxTableWidth) {
    const ratio = maxTableWidth / totalW;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.max(6, Math.floor(widths[i] * ratio));
    }
  }

  const truncPad = (s: string, w: number) => {
    if (s.length > w) return s.slice(0, w - 1) + "…";
    return s + " ".repeat(Math.max(0, w - s.length));
  };

  const sep = widths.map((w) => "─".repeat(w)).join("─┬─");
  let out = "\n";

  if (headers.length) {
    out +=
      chalk.bold(headers.map((h, i) => truncPad(h, widths[i])).join(" │ ")) +
      "\n";
    out += chalk.dim(sep) + "\n";
  }

  for (const row of rows) {
    out +=
      row.map((c, i) => truncPad(c, widths[i])).join(chalk.dim(" │ ")) + "\n";
  }

  return out + "\n";
};

const marked = new Marked({ renderer: originalRenderer, ...terminalOpts });

function renderMarkdown(text: string): string {
  let out = (marked.parse(text) as string).trimEnd();
  // Catch any leftover raw **bold** that marked-terminal didn't render
  out = out.replace(/\*\*(.+?)\*\*/g, chalk.bold("$1"));
  // Catch leftover *italic*
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, chalk.italic("$1"));
  // Collapse excessive blank lines (3+ → 1)
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

// ── Diff display & confirmation ─────────────────────────────────────────────
function showDiff(filePath: string, oldContent: string, newContent: string) {
  const rel = path.relative(CWD, filePath) || filePath;
  console.log();
  console.log(chalk.bold.white(` 📄 ${rel}`));
  ui.hr();

  const changes = diffLines(oldContent, newContent);
  let lineCount = 0;
  const MAX_DIFF_LINES = 80;

  for (const part of changes) {
    if (lineCount >= MAX_DIFF_LINES) {
      ui.dim("… diff truncated");
      break;
    }
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      if (lineCount >= MAX_DIFF_LINES) break;
      if (part.added) {
        console.log(chalk.green(` + ${line}`));
        lineCount++;
      } else if (part.removed) {
        console.log(chalk.red(` - ${line}`));
        lineCount++;
      }
    }
  }
  ui.hr();
}

let activeRL: readline.Interface | null = null;

function setActiveRL(rl: readline.Interface | null) {
  activeRL = rl;
}

async function confirmWrite(
  filePath: string,
  oldContent: string,
  newContent: string
): Promise<boolean> {
  showDiff(filePath, oldContent, newContent);
  if (activeRL) activeRL.pause();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question(
      ` ${chalk.green("y")}${chalk.dim("/")}${chalk.red("n")} ${chalk.dim("Apply?")} `,
      (answer) => {
        rl.close();
        if (activeRL) activeRL.resume();
        resolve(answer.trim().toLowerCase().startsWith("y"));
      }
    );
  });
}

// ── Tools ───────────────────────────────────────────────────────────────────
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file. Use absolute paths or paths relative to the working directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Make a surgical edit to a file by replacing an exact string match. " +
        "Provide the old_string to find and new_string to replace it with. " +
        "The old_string must match exactly (including whitespace/indentation). " +
        "Use replace_all: true to replace every occurrence.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          old_string: {
            type: "string",
            description: "Exact string to find in the file",
          },
          new_string: {
            type: "string",
            description: "Replacement string",
          },
          replace_all: {
            type: "boolean",
            description: "Replace all occurrences (default: false)",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write content to a file (full overwrite). Creates parent directories if needed. " +
        "Prefer edit_file for modifying existing files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "Full file content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or empty directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory path to delete",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file or directory.",
      parameters: {
        type: "object",
        properties: {
          old_path: { type: "string", description: "Current path" },
          new_path: { type: "string", description: "New path" },
        },
        required: ["old_path", "new_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "List files and directories. Returns names with / suffix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path (defaults to cwd)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_search",
      description:
        "Search for a pattern in files recursively. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search pattern (regex)" },
          path: {
            type: "string",
            description: "Directory to search in (defaults to cwd)",
          },
          include: {
            type: "string",
            description: "File glob pattern, e.g. '*.ts' or '*.py'",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command and return its output. Use for builds, tests, git, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
      },
    },
  },
];

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(CWD, p);
}

function isBinary(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<string> {
  try {
    switch (name) {
      case "read_file": {
        const filePath = resolvePath(args.path);
        if (isBinary(filePath)) {
          const size = fs.statSync(filePath).size;
          return `[Binary file: ${path.basename(filePath)} (${(size / 1024).toFixed(1)} KB)]`;
        }
        return fs.readFileSync(filePath, "utf-8");
      }

      case "edit_file": {
        const filePath = resolvePath(args.path);
        if (!fs.existsSync(filePath))
          return `Error: File not found: ${filePath}`;

        const oldContent = fs.readFileSync(filePath, "utf-8");
        if (!args.old_string) {
          return "Error: old_string must be a non-empty string.";
        }
        if (!oldContent.includes(args.old_string)) {
          return `Error: old_string not found in ${filePath}. Make sure it matches exactly (including whitespace).`;
        }

        let newContent: string;
        if (args.replace_all) {
          newContent = oldContent.split(args.old_string).join(args.new_string);
        } else {
          newContent = oldContent.replace(args.old_string, args.new_string);
        }

        const approved = await confirmWrite(filePath, oldContent, newContent);
        if (!approved) return "User denied the edit.";

        fs.writeFileSync(filePath, newContent, "utf-8");
        const count = args.replace_all
          ? oldContent.split(args.old_string).length - 1
          : 1;
        return `Applied edit to ${filePath} (${count} replacement${count > 1 ? "s" : ""})`;
      }

      case "write_file": {
        const filePath = resolvePath(args.path);
        const exists = fs.existsSync(filePath);
        const oldContent = exists ? fs.readFileSync(filePath, "utf-8") : "";

        const approved = await confirmWrite(filePath, oldContent, args.content);
        if (!approved) return "User denied the write.";

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, args.content, "utf-8");
        return `Wrote ${args.content.length} bytes to ${filePath}`;
      }

      case "delete_file": {
        const filePath = resolvePath(args.path);
        if (!fs.existsSync(filePath)) return `Error: Not found: ${filePath}`;

        if (activeRL) activeRL.pause();
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: true,
        });
        const confirmed = await new Promise<boolean>((resolve) => {
          const rel = path.relative(CWD, filePath) || filePath;
          rl.question(
            ` ${chalk.green("y")}${chalk.dim("/")}${chalk.red("n")} ${chalk.dim(`Delete ${rel}?`)} `,
            (answer) => {
              rl.close();
              if (activeRL) activeRL.resume();
              resolve(answer.trim().toLowerCase().startsWith("y"));
            }
          );
        });
        if (!confirmed) return "User denied deletion.";

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmdirSync(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
        return `Deleted ${filePath}`;
      }

      case "rename_file": {
        const oldPath = resolvePath(args.old_path);
        const newPath = resolvePath(args.new_path);
        if (!fs.existsSync(oldPath)) return `Error: Not found: ${oldPath}`;
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        fs.renameSync(oldPath, newPath);
        return `Renamed ${oldPath} → ${newPath}`;
      }

      case "list_directory": {
        const dirPath = resolvePath(args.path ?? ".");
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
          .map((e) => {
            if (e.isDirectory()) return `${e.name}/`;
            const fullPath = path.join(dirPath, e.name);
            if (isBinary(fullPath)) return `${e.name} [binary]`;
            return e.name;
          })
          .join("\n");
      }

      case "grep_search": {
        const searchPath = resolvePath(args.path ?? ".");
        const grepArgs = ["-rn", args.pattern, searchPath];
        if (args.include) grepArgs.push(`--include=${args.include}`);
        try {
          const raw = execFileSync("grep", grepArgs, {
            encoding: "utf-8",
            timeout: 10000,
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
          const lines = raw.split("\n").slice(0, 50).join("\n");
          return lines || "No matches found.";
        } catch (e: any) {
          if (e.status === 1) return "No matches found.";
          throw e;
        }
      }

      case "run_command": {
        return execSync(args.command, {
          encoding: "utf-8",
          cwd: CWD,
          timeout: 30000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// ── Client ──────────────────────────────────────────────────────────────────
async function createClient(): Promise<OpenAI> {
  const apiKey = await getApiKey();
  return new OpenAI({ apiKey, baseURL: BASE_URL });
}

// ── State ───────────────────────────────────────────────────────────────────
interface ChatState {
  model: string;
  messages: ChatCompletionMessageParam[];
  client: OpenAI;
}

function freshState(client: OpenAI): ChatState {
  return {
    model: DEFAULT_MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }],
    client,
  };
}

// ── API call with retry ─────────────────────────────────────────────────────
async function apiCallWithRetry(
  state: ChatState
): Promise<AsyncIterable<any>> {
  let lastErr: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await state.client.chat.completions.create({
        model: state.model,
        messages: state.messages,
        tools,
        tool_choice: "auto",
        max_tokens: 4096,
        stream: true,
      });
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        ui.dim(`Retrying in ${delay / 1000}s… (${err.message})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ── Streaming agent loop ────────────────────────────────────────────────────
interface StreamedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function formatToolLabel(name: string, args: Record<string, any>): string {
  const rel = (p: string) =>
    path.relative(CWD, resolvePath(p)) || p;
  switch (name) {
    case "read_file":
      return `read ${chalk.white(rel(args.path))}`;
    case "edit_file":
      return `edit ${chalk.white(rel(args.path))}`;
    case "write_file":
      return `write ${chalk.white(rel(args.path))}`;
    case "delete_file":
      return `delete ${chalk.white(rel(args.path))}`;
    case "rename_file":
      return `rename ${chalk.white(rel(args.old_path))} → ${chalk.white(rel(args.new_path))}`;
    case "list_directory":
      return `ls ${chalk.white(rel(args.path ?? "."))}`;
    case "grep_search": {
      const extra = args.include ? chalk.dim(` (${args.include})`) : "";
      return `grep ${chalk.white(args.pattern)}${extra}`;
    }
    case "run_command": {
      const cmd = args.command.length > 50 ? args.command.slice(0, 50) + "…" : args.command;
      return `run ${chalk.white(cmd)}`;
    }
    default:
      return `${name}(…)`;
  }
}

async function agentLoop(state: ChatState): Promise<string> {
  const MAX_ITERATIONS = 15;
  let lastText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let textContent = "";
    const toolCalls: StreamedToolCall[] = [];

    try {
      startSpinner();
      const stream = await apiCallWithRetry(state);

      let cleared = false;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          if (!cleared) {
            stopSpinner();
            cleared = true;
          }
          textContent += delta.content;
        }

        if (delta.tool_calls) {
          if (!cleared) {
            stopSpinner();
            cleared = true;
          }
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              while (toolCalls.length <= tc.index) {
                toolCalls.push({ id: "", name: "", arguments: "" });
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name)
                toolCalls[tc.index].name = tc.function.name;
              if (tc.function?.arguments)
                toolCalls[tc.index].arguments += tc.function.arguments;
            }
          }
        }
      }

      stopSpinner();

      if (textContent) {
        console.log();
        // Render response with left-border accent
        const rendered = renderMarkdown(textContent);
        ui.response(rendered);
        console.log();
        lastText = textContent;
      }
    } catch (err: any) {
      stopSpinner();
      ui.error(`API error: ${err.message}`);
      return "";
    }

    // Build assistant message for history
    const assistantMsg: any = {
      role: "assistant",
      content: textContent || null,
    };
    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    state.messages.push(assistantMsg as ChatCompletionMessageParam);

    // Execute tool calls
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        let fnArgs: Record<string, any> = {};
        try {
          fnArgs = JSON.parse(tc.arguments);
        } catch {}

        const toolLabel = formatToolLabel(tc.name, fnArgs);
        ui.tool(toolLabel);

        const result = await executeTool(tc.name, fnArgs);

        if (tc.name !== "write_file" && tc.name !== "edit_file" && tc.name !== "delete_file") {
          ui.toolResult(result);
        } else {
          ui.dim(result);
        }

        state.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        } as ChatCompletionMessageParam);
      }
      ui.toolEnd();
      continue;
    }

    break;
  }

  return lastText;
}

// ── Session save/load ───────────────────────────────────────────────────────
function saveSession(state: ChatState, name?: string) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const sessionName = name || `session-${Date.now()}`;
  const filePath = path.join(SESSIONS_DIR, `${sessionName}.json`);
  const data = {
    model: state.model,
    messages: state.messages,
    savedAt: new Date().toISOString(),
    cwd: CWD,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  ui.success(`Session saved: ${sessionName}`);
}

function loadSession(state: ChatState, name: string): boolean {
  const filePath = path.join(SESSIONS_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    ui.error(`Session not found: ${name}`);
    return false;
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  state.messages = data.messages;
  state.model = data.model || state.model;
  ui.success(`Loaded: ${name} (${data.messages.length - 1} messages)`);
  return true;
}

function listSessions() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    ui.dim("No saved sessions.");
    return;
  }
  for (const f of files) {
    const name = f.replace(".json", "");
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8")
      );
      const msgs = (data.messages?.length || 1) - 1;
      const date = data.savedAt
        ? new Date(data.savedAt).toLocaleDateString()
        : "?";
      console.log(
        `  ${chalk.cyan(name)} ${chalk.dim(`${msgs} msgs · ${date}`)}`
      );
    } catch {
      console.log(`  ${chalk.cyan(name)}`);
    }
  }
}

// ── Slash commands ──────────────────────────────────────────────────────────
function handleCommand(input: string, state: ChatState): boolean {
  const [cmd, ...rest] = input.split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "/quit":
    case "/exit":
    case "/q":
      ui.dim("Goodbye!");
      process.exit(0);

    case "/clear":
      state.messages = [state.messages[0]];
      ui.dim("Conversation cleared.");
      return true;

    case "/model":
      if (arg) {
        state.model = arg;
        ui.success(`Model → ${state.model}`);
      } else {
        ui.dim(`Model: ${state.model}`);
      }
      return true;

    case "/system":
      if (arg) {
        state.messages[0] = { role: "system", content: arg };
        ui.success("System prompt updated.");
      } else {
        const sys = state.messages[0];
        const content = "content" in sys ? sys.content : "";
        ui.dim(String(content).slice(0, 200) + "…");
      }
      return true;

    case "/history": {
      let count = 0;
      for (const m of state.messages.slice(1)) {
        if (m.role === "tool") continue;
        const content =
          "content" in m && typeof m.content === "string" ? m.content : "";
        const preview =
          content.length > 80 ? content.slice(0, 80) + "…" : content;
        const icon = m.role === "user" ? chalk.green("▹") : chalk.cyan("◃");
        console.log(`  ${icon} ${preview}`);
        if (++count >= 20) {
          ui.dim("… and more");
          break;
        }
      }
      return true;
    }

    case "/key":
      if (arg) {
        saveConfig({ api_key: arg, model: state.model });
        state.client = new OpenAI({ apiKey: arg, baseURL: BASE_URL });
        ui.success("Key updated and saved.");
      } else {
        const config = loadConfig();
        const masked = config?.api_key
          ? config.api_key.slice(0, 6) + "…" + config.api_key.slice(-4)
          : "not set";
        ui.dim(`Key: ${masked}`);
        ui.dim(`Config: ${CONFIG_FILE}`);
      }
      return true;

    case "/save":
      saveSession(state, arg || undefined);
      return true;

    case "/load":
      if (!arg) {
        listSessions();
        ui.dim("Usage: /load <name>");
      } else {
        loadSession(state, arg);
      }
      return true;

    case "/sessions":
      listSessions();
      return true;

    case "/version":
      console.log();
      console.log(`  ${chalk.cyan.bold("merc")} ${chalk.dim(`v${VERSION}`)}`);
      console.log(`  ${chalk.dim("Model:")}  ${state.model}`);
      console.log(`  ${chalk.dim("API:")}    ${BASE_URL}`);
      console.log(`  ${chalk.dim("Config:")} ${CONFIG_FILE}`);
      console.log();
      return true;

    case "/help":
      console.log();
      const cmds = [
        ["/clear", "Reset conversation"],
        ["/model [name]", "Show or switch model"],
        ["/system [prompt]", "Show or change system prompt"],
        ["/key [key]", "Show or update API key"],
        ["/save [name]", "Save conversation"],
        ["/load <name>", "Load saved conversation"],
        ["/sessions", "List saved sessions"],
        ["/history", "Show conversation history"],
        ["/version", "Show version info"],
        ["/quit", "Exit"],
      ];
      for (const [c, desc] of cmds) {
        const padded = c.padEnd(20);
        console.log(`  ${chalk.cyan(padded)} ${chalk.dim(desc)}`);
      }
      console.log();
      return true;

    default:
      ui.dim(`Unknown: ${cmd}`);
      return true;
  }
}

// ── Banner ──────────────────────────────────────────────────────────────────
function printBanner(model: string) {
  console.log();
  ui.hr();
  console.log(
    `  ${chalk.cyan.bold("⚡ merc")} ${chalk.dim(`v${VERSION}`)}  ${chalk.dim("·")}  ${chalk.white(model)}  ${chalk.dim("·")}  ${chalk.dim(path.basename(CWD))}`
  );
  ui.hr();
  console.log();
}

// ── Readline with history ───────────────────────────────────────────────────
function loadHistory(): string[] {
  try {
    return fs
      .readFileSync(HISTORY_FILE, "utf-8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function appendHistory(line: string) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.appendFileSync(HISTORY_FILE, line + "\n");
}

function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${chalk.cyan("›")} `,
    terminal: true,
    history: loadHistory().slice(-100),
    historySize: 200,
  });
}

function prompt(rl: readline.Interface): Promise<string | null> {
  return new Promise((resolve) => {
    rl.prompt();
    rl.once("line", (line) => resolve(line.trim()));
    rl.once("close", () => resolve(null));
  });
}

// ── One-shot mode ───────────────────────────────────────────────────────────
async function oneShot(input: string, state: ChatState) {
  state.messages.push({ role: "user", content: input });
  await agentLoop(state);
}

// ── Interactive mode ────────────────────────────────────────────────────────
async function interactive(state: ChatState) {
  printBanner(state.model);
  const rl = createRL();
  setActiveRL(rl);

  let interrupted = false;
  process.on("SIGINT", () => {
    stopSpinner();
    if (interrupted) {
      console.log(chalk.dim("\n  Quit."));
      process.exit(0);
    }
    interrupted = true;
    console.log(chalk.dim("\n  Ctrl+C again to exit."));
    rl.prompt();
    setTimeout(() => {
      interrupted = false;
    }, 2000);
  });

  while (true) {
    const input = await prompt(rl);
    if (input === null) {
      ui.dim("Goodbye!");
      break;
    }
    if (!input) continue;

    appendHistory(input);

    if (input.startsWith("/")) {
      handleCommand(input, state);
      continue;
    }

    state.messages.push({ role: "user", content: input });
    await agentLoop(state);
  }

  setActiveRL(null);
  rl.close();
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const client = await createClient();
  const state = freshState(client);

  const args = process.argv.slice(2);
  if (args.length > 0) {
    await oneShot(args.join(" "), state);
  } else {
    await interactive(state);
  }
}

main();
