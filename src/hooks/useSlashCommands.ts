import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { useApp } from "ink";
import OpenAI from "openai";
import { useCallback } from "react";
import { loadConfig, saveConfig } from "../lib/config.ts";
import {
  BASE_URL,
  CONFIG_FILE,
  CWD,
  GLOBAL_SKILLS_DIR,
  LOCAL_SKILLS_DIR,
  VERSION,
} from "../lib/paths.ts";
import { listSessions, loadSession, saveSession } from "../lib/sessions.ts";
import type { SkillRegistry } from "../lib/skills.ts";
import { reloadSkills } from "../lib/skills.ts";
import type { ChatState, CompletedItemInput } from "../lib/types.ts";

interface SlashCommandDeps {
  getState: () => ChatState;
  setModel: (model: string) => void;
  addCompleted: (item: CompletedItemInput) => void;
  clearConversation: () => void;
  updateClient: (client: OpenAI) => void;
  model: string;
  cookMode?: boolean;
  setCookMode?: (mode: boolean) => void;
  skillRegistry?: SkillRegistry;
  refreshSystemPrompt?: () => void;
  runLoop?: (message: string) => void;
}

/**
 * Returns true if the input was a slash command (handled),
 * false if it should be sent as a normal message.
 */
export function useSlashCommands(deps: SlashCommandDeps) {
  const { exit } = useApp();

  const handleCommand = useCallback(
    (input: string): boolean => {
      if (!input.startsWith("/")) return false;

      const [cmd, ...rest] = input.split(/\s+/);
      const arg = rest.join(" ");
      const status = (content: string) => deps.addCompleted({ type: "status", content });

      switch (cmd) {
        case "/quit":
        case "/exit":
        case "/q":
          status("Goodbye!");
          exit();
          return true;

        case "/clear":
          deps.clearConversation();
          status("Conversation cleared.");
          return true;

        case "/model":
          if (arg) {
            deps.setModel(arg);
            status(`Model → ${arg}`);
          } else {
            status(`Model: ${deps.model}`);
          }
          return true;

        case "/system":
          if (arg) {
            const state = deps.getState();
            state.messages[0] = { role: "system", content: arg };
            status("System prompt updated.");
          } else {
            const state = deps.getState();
            const sys = state.messages[0];
            const content = sys && "content" in sys ? String(sys.content) : "";
            status(`${content.slice(0, 200)}…`);
          }
          return true;

        case "/history": {
          const state = deps.getState();
          let count = 0;
          for (const m of state.messages.slice(1)) {
            if (m.role === "tool") continue;
            const content = "content" in m && typeof m.content === "string" ? m.content : "";
            const preview = content.length > 80 ? `${content.slice(0, 80)}…` : content;
            const icon = m.role === "user" ? "▹" : "◃";
            status(`${icon} ${preview}`);
            if (++count >= 20) {
              status("… and more");
              break;
            }
          }
          return true;
        }

        case "/key":
          if (arg) {
            const state = deps.getState();
            saveConfig({ api_key: arg, model: state.model });
            deps.updateClient(new OpenAI({ apiKey: arg, baseURL: BASE_URL }));
            status("Key updated and saved.");
          } else {
            const config = loadConfig();
            const masked = config?.api_key
              ? `${config.api_key.slice(0, 6)}…${config.api_key.slice(-4)}`
              : "not set";
            status(`Key: ${masked}`);
            status(`Config: ${CONFIG_FILE}`);
          }
          return true;

        case "/save": {
          const state = deps.getState();
          const name = saveSession(state, arg || undefined);
          status(`Session saved: ${name}`);
          return true;
        }

        case "/load":
          if (!arg) {
            const sessions = listSessions();
            if (sessions.length === 0) {
              status("No saved sessions.");
            } else {
              for (const s of sessions) {
                status(`${s.name}  ${s.messageCount} msgs · ${s.date}`);
              }
            }
            status("Usage: /load <name>");
          } else {
            const state = deps.getState();
            const result = loadSession(state, arg);
            status(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
          }
          return true;

        case "/sessions": {
          const sessions = listSessions();
          if (sessions.length === 0) {
            status("No saved sessions.");
          } else {
            for (const s of sessions) {
              status(`${s.name}  ${s.messageCount} msgs · ${s.date}`);
            }
          }
          return true;
        }

        case "/version":
          status(`merc v${VERSION}`);
          status(`Model:  ${deps.model}`);
          status(`API:    ${BASE_URL}`);
          status(`Config: ${CONFIG_FILE}`);
          return true;

        case "/cook":
          if (deps.setCookMode) {
            const next = !deps.cookMode;
            deps.setCookMode(next);
            status(
              next
                ? "Cook mode ON — auto-approving all file writes"
                : "Cook mode OFF — back to manual approval",
            );
          }
          return true;

        case "/skills": {
          const registry = deps.skillRegistry;
          if (!arg) {
            // List skills
            if (!registry || registry.size === 0) {
              status("No skills installed.");
              status("");
              status("Install skills with:");
              status("  /skills add <owner/repo>          (project-local)");
              status("  /skills add <owner/repo> --global  (global)");
              status("");
              status(`Local:  ${LOCAL_SKILLS_DIR}`);
              status(`Global: ${GLOBAL_SKILLS_DIR}`);
            } else {
              status(`${registry.size} skill${registry.size === 1 ? "" : "s"} installed:`);
              status("");
              for (const [, skill] of registry) {
                const src = skill.source === "global" ? "(global)" : "(local)";
                status(`  ${skill.name.padEnd(24)} ${src}  ${skill.description}`);
              }
            }
          } else if (arg.startsWith("add ")) {
            // /skills add <owner/repo> [--global]
            const addArgs = arg.slice(4).trim().split(/\s+/);
            const repo = addArgs.find((a) => !a.startsWith("-"));
            const isGlobal = addArgs.includes("--global") || addArgs.includes("-g");
            if (!repo) {
              status("Usage: /skills add <owner/repo> [--global]");
              return true;
            }
            const targetDir = isGlobal ? GLOBAL_SKILLS_DIR : LOCAL_SKILLS_DIR;
            fs.mkdirSync(targetDir, { recursive: true });
            status(`Installing ${repo} to ${isGlobal ? "global" : "local"} skills...`);
            try {
              const output = execFileSync("npx", ["skills", "add", repo, "--copy", "-y"], {
                encoding: "utf-8",
                cwd: CWD,
                timeout: 60000,
                env: { ...process.env, MERC_SKILLS_DIR: targetDir },
                stdio: ["pipe", "pipe", "pipe"],
              }).trim();
              if (output) status(output);
              // Reload registry and refresh system prompt
              if (registry) {
                reloadSkills(registry);
                deps.refreshSystemPrompt?.();
              }
              status(
                `Done. ${registry?.size ?? 0} skill${(registry?.size ?? 0) === 1 ? "" : "s"} now installed.`,
              );
            } catch (e: unknown) {
              // npx skills may not support --agent merc yet, so fall back to manual copy
              const msg = e instanceof Error ? e.message.split("\n")[0] : "unknown error";
              status(`npx skills failed: ${msg}`);
              status("Try manually placing skill directories in:");
              status(`  ${targetDir}/<skill-name>/SKILL.md`);
            }
          } else if (arg.startsWith("remove ")) {
            // /skills remove <name>
            const skillName = arg.slice(7).trim().toLowerCase();
            if (!skillName) {
              status("Usage: /skills remove <skill-name>");
              return true;
            }
            if (!registry || !registry.has(skillName)) {
              status(`Skill not found: "${skillName}"`);
              return true;
            }
            const skill = registry.get(skillName);
            if (!skill) {
              status(`Skill not found: "${skillName}"`);
              return true;
            }
            try {
              fs.rmSync(skill.dir, { recursive: true, force: true });
              reloadSkills(registry);
              deps.refreshSystemPrompt?.();
              status(`Removed skill: ${skill.name}`);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "unknown error";
              status(`Error removing skill: ${msg}`);
            }
          } else {
            status("Usage: /skills [add <owner/repo> [--global] | remove <name>]");
          }
          return true;
        }

        case "/help": {
          const cmds = [
            ["/clear", "Reset conversation"],
            ["/cook", "Toggle auto-approve file writes"],
            ["/skills", "List, add, or remove skills"],
            ["/<skill-name>", "Activate an installed skill"],
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
            status(`${(c ?? "").padEnd(20)} ${desc}`);
          }
          return true;
        }

        default: {
          // Check if the command matches an installed skill name
          const skillName = cmd?.slice(1).toLowerCase(); // strip leading /
          const registry = deps.skillRegistry;
          if (skillName && registry?.has(skillName) && deps.runLoop) {
            const skill = registry.get(skillName);
            if (!skill) return true;
            status(`Activating skill: ${skill.name}`);
            deps.runLoop(`Use the "${skill.name}" skill. ${arg || ""}`);
            return true;
          }
          status(`Unknown: ${cmd}`);
          return true;
        }
      }
    },
    [deps, exit],
  );

  return { handleCommand };
}
