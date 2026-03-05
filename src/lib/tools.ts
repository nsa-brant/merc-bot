import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, execFileSync } from "node:child_process";
import chalk from "chalk";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { CWD } from "./paths.ts";
import type { ConfirmFn, DeleteConfirmFn } from "./types.ts";
import { webSearch, webFetch } from "./web.ts";

export const tools: ChatCompletionTool[] = [
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
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web using DuckDuckGo. Returns titles, URLs, and snippets. " +
        "Use this to find documentation, look up errors, research APIs, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          max_results: {
            type: "number",
            description: "Max results to return (default: 8)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch a URL and return its text content. HTML is converted to readable text. " +
        "Use this to read documentation pages, API references, articles, etc.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          max_length: {
            type: "number",
            description: "Max characters to return (default: 8000)",
          },
        },
        required: ["url"],
      },
    },
  },
];

export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(CWD, p);
}

export function isBinary(filePath: string): boolean {
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

export function formatToolLabel(name: string, args: Record<string, any>): string {
  const rel = (p: string) => path.relative(CWD, resolvePath(p)) || p;
  switch (name) {
    case "read_file":
      return `read ${rel(args.path)}`;
    case "edit_file":
      return `edit ${rel(args.path)}`;
    case "write_file":
      return `write ${rel(args.path)}`;
    case "delete_file":
      return `delete ${rel(args.path)}`;
    case "rename_file":
      return `rename ${rel(args.old_path)} -> ${rel(args.new_path)}`;
    case "list_directory":
      return `ls ${rel(args.path ?? ".")}`;
    case "grep_search": {
      const extra = args.include ? ` (${args.include})` : "";
      return `grep ${args.pattern}${extra}`;
    }
    case "run_command": {
      const cmd =
        args.command.length > 50
          ? args.command.slice(0, 50) + "..."
          : args.command;
      return `run ${cmd}`;
    }
    case "web_search": {
      const q =
        args.query.length > 40
          ? args.query.slice(0, 40) + "..."
          : args.query;
      return `search ${q}`;
    }
    case "web_fetch": {
      const u =
        args.url.length > 50
          ? args.url.slice(0, 50) + "..."
          : args.url;
      return `fetch ${u}`;
    }
    default:
      return `${name}(...)`;
  }
}

/**
 * Execute a tool. Accepts confirm/deleteConfirm callbacks so the UI layer
 * can handle confirmations (ink dialogs instead of readline).
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  confirm: ConfirmFn,
  deleteConfirm: DeleteConfirmFn
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

        const approved = await confirm(filePath, oldContent, newContent);
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

        const approved = await confirm(filePath, oldContent, args.content);
        if (!approved) return "User denied the write.";

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, args.content, "utf-8");
        return `Wrote ${args.content.length} bytes to ${filePath}`;
      }

      case "delete_file": {
        const filePath = resolvePath(args.path);
        if (!fs.existsSync(filePath)) return `Error: Not found: ${filePath}`;

        const confirmed = await deleteConfirm(filePath);
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
        return `Renamed ${oldPath} -> ${newPath}`;
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

      case "web_search": {
        const results = await webSearch(args.query, args.max_results ?? 8);
        if (results.length === 0) return "No results found.";
        return results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join("\n\n");
      }

      case "web_fetch": {
        return await webFetch(args.url, args.max_length ?? 8000);
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
