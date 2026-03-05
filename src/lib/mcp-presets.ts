import type { McpServerConfig } from "./types.ts";

export interface McpPreset {
  description: string;
  command: string;
  args: string[];
  requiredEnv?: string[];
  requiredArgs?: string[];
}

export const MCP_PRESETS: Record<string, McpPreset> = {
  filesystem: {
    description: "Secure file operations (read, write, search)",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "{path}"],
    requiredArgs: ["path"],
  },
  memory: {
    description: "Knowledge graph persistence",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  fetch: {
    description: "Web content fetching and conversion",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
  },
  git: {
    description: "Git repository tools",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-git", "--repository", "{path}"],
    requiredArgs: ["path"],
  },
  github: {
    description: "GitHub API tools",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    requiredEnv: ["GITHUB_TOKEN"],
  },
  time: {
    description: "Time and timezone utilities",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-time"],
  },
  "sequential-thinking": {
    description: "Step-by-step problem solving",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
  "brave-search": {
    description: "Web search via Brave",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    requiredEnv: ["BRAVE_API_KEY"],
  },
  puppeteer: {
    description: "Browser automation",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
  },
  sqlite: {
    description: "SQLite database tools",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite", "{path}"],
    requiredArgs: ["path"],
  },
};

export function resolvePreset(
  preset: McpPreset,
  userArgs: string[],
): { config: McpServerConfig; error?: string } | { config?: never; error: string } {
  if (preset.requiredArgs && preset.requiredArgs.length > userArgs.length) {
    const usage = preset.requiredArgs.map((a) => `<${a}>`).join(" ");
    return { error: `Missing arguments. Usage: ${usage}` };
  }

  let resolvedArgs = [...preset.args];
  if (preset.requiredArgs) {
    for (let i = 0; i < preset.requiredArgs.length; i++) {
      const placeholder = `{${preset.requiredArgs[i]}}`;
      const value = userArgs[i];
      if (value) {
        resolvedArgs = resolvedArgs.map((a) => (a === placeholder ? value : a));
      }
    }
  }

  return {
    config: {
      command: preset.command,
      args: resolvedArgs,
    },
  };
}
