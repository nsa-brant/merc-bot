import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { cancelAgent, createAgent, getAgent, listAgents } from "./agent-manager.ts";
import { CWD } from "./paths.ts";
import { isBinary, resolvePath } from "./tool-utils.ts";
import type { ChatState, ConfirmFn, DeleteConfirmFn } from "./types.ts";
import { webFetch, webSearch } from "./web.ts";

const DANGEROUS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+(-[^\s]*r|-r[^\s]*)\b/, reason: "Recursive delete (rm -r)" },
  { pattern: /\brmdir\b/, reason: "Remove directory (rmdir)" },
  { pattern: /\bdd\s+if=/, reason: "Disk destroyer (dd)" },
  { pattern: /\bmkfs\b/, reason: "Format filesystem (mkfs)" },
  { pattern: /\bchmod\s+777\b/, reason: "World-writable permissions (chmod 777)" },
  { pattern: /\bchmod\s+(-[^\s]*R|-R[^\s]*)\b/, reason: "Recursive permission change (chmod -R)" },
  { pattern: />\s*\/dev\//, reason: "Writing to device file (> /dev/)" },
  { pattern: /:\(\)\s*\{/, reason: "Fork bomb" },
  { pattern: /\bcurl\b.*\|\s*(sh|bash|zsh)\b/, reason: "Piping curl to shell" },
  { pattern: /\bwget\b.*\|\s*(sh|bash|zsh)\b/, reason: "Piping wget to shell" },
  { pattern: /\bsudo\b/, reason: "Elevated privileges (sudo)" },
  { pattern: /\bshutdown\b/, reason: "System shutdown" },
  { pattern: /\breboot\b/, reason: "System reboot" },
  { pattern: /\bhalt\b/, reason: "System halt" },
  { pattern: /\bkill\s+-9\b/, reason: "Force kill process (kill -9)" },
  { pattern: /\bkillall\b/, reason: "Kill all processes (killall)" },
  { pattern: /--no-preserve-root/, reason: "No preserve root flag" },
];

/**
 * Check if a command matches any dangerous patterns.
 * Returns { dangerous: true, reason } if matched, otherwise { dangerous: false }.
 */
export function isDangerousCommand(command: string): { dangerous: boolean; reason: string } {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason };
    }
  }
  return { dangerous: false, reason: "" };
}

const TOOL_ARG_SCHEMAS: Record<string, { field: string; type: string }[]> = {
  read_file: [{ field: "path", type: "string" }],
  edit_file: [
    { field: "path", type: "string" },
    { field: "old_string", type: "string" },
    { field: "new_string", type: "string" },
  ],
  write_file: [
    { field: "path", type: "string" },
    { field: "content", type: "string" },
  ],
  delete_file: [{ field: "path", type: "string" }],
  rename_file: [
    { field: "old_path", type: "string" },
    { field: "new_path", type: "string" },
  ],
  list_directory: [],
  grep_search: [{ field: "pattern", type: "string" }],
  run_command: [{ field: "command", type: "string" }],
  web_search: [{ field: "query", type: "string" }],
  web_fetch: [{ field: "url", type: "string" }],
  create_agent: [{ field: "prompt", type: "string" }],
  list_agents: [],
  get_agent_status: [{ field: "id", type: "string" }],
  cancel_agent: [{ field: "id", type: "string" }],
};

/**
 * Validate tool arguments against the required schema.
 * Returns null if valid, or a descriptive error message if invalid.
 */
export function validateToolArgs(name: string, args: Record<string, any>): string | null {
  const schema = TOOL_ARG_SCHEMAS[name];
  if (!schema) return null; // unknown tool — let executeTool handle it

  for (const { field, type } of schema) {
    if (!(field in args) || args[field] === undefined || args[field] === null) {
      return `Missing required argument "${field}" for tool "${name}".`;
    }
    if (typeof args[field] !== type) {
      return `Argument "${field}" for tool "${name}" must be a ${type}, got ${typeof args[field]}.`;
    }
  }

  return null;
}

/**
 * Execute a tool. Accepts confirm/deleteConfirm callbacks so the UI layer
 * can handle confirmations (ink dialogs instead of readline).
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  confirm: ConfirmFn,
  deleteConfirm: DeleteConfirmFn,
  chatState?: ChatState,
): Promise<string> {
  try {
    const validationError = validateToolArgs(name, args);
    if (validationError) return validationError;

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
        if (!fs.existsSync(filePath)) return `Error: File not found: ${filePath}`;

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
        const count = args.replace_all ? oldContent.split(args.old_string).length - 1 : 1;
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
        const check = isDangerousCommand(args.command);
        if (check.dangerous) {
          const confirmed = await deleteConfirm(
            `⚠️ Dangerous command: ${check.reason}\n${args.command}`,
          );
          if (!confirmed) return "User denied dangerous command.";
        }
        let output = execSync(args.command, {
          encoding: "utf-8",
          cwd: CWD,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        if (output.length > 100_000) {
          output = output.slice(0, 100_000) + "\n\n[output truncated at 100,000 characters]";
        }
        return output;
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

      case "create_agent": {
        if (!chatState) return "Error: Agent tools require chat state.";
        try {
          const id = createAgent(chatState.client, chatState.model, args.prompt);
          return `Started background agent ${id}. Use get_agent_status to check on it.`;
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      }

      case "list_agents": {
        const agents = listAgents();
        if (agents.length === 0) return "No background agents.";
        return agents
          .map((a) => {
            const elapsed = Math.round((Date.now() - a.createdAt) / 1000);
            const snippet = a.prompt.length > 60 ? `${a.prompt.slice(0, 60)}...` : a.prompt;
            return `${a.id} [${a.status}] ${elapsed}s — ${snippet}`;
          })
          .join("\n");
      }

      case "get_agent_status": {
        const agent = getAgent(args.id);
        if (!agent) return `Error: Agent "${args.id}" not found.`;
        const elapsed = Math.round(((agent.completedAt ?? Date.now()) - agent.createdAt) / 1000);
        let result = `Agent: ${agent.id}\nStatus: ${agent.status}\nElapsed: ${elapsed}s\nPrompt: ${agent.prompt}`;
        if (agent.toolLog.length > 0) {
          result += `\n\nTool log:\n${agent.toolLog.join("\n")}`;
        }
        if (agent.output) {
          result += `\n\nOutput:\n${agent.output}`;
        }
        if (agent.error) {
          result += `\n\nError: ${agent.error}`;
        }
        return result;
      }

      case "cancel_agent": {
        const cancelled = cancelAgent(args.id);
        if (cancelled) return `Cancelled agent ${args.id}.`;
        const existing = getAgent(args.id);
        if (!existing) return `Error: Agent "${args.id}" not found.`;
        return `Agent ${args.id} is not running (status: ${existing.status}).`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
