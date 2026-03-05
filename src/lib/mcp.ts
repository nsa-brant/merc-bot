import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { tools as builtinTools } from "./tool-defs.ts";
import type { McpServerConfig } from "./types.ts";

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_NAME_LENGTH = 64;

interface McpToolDef {
  name: string;
  originalName: string;
  def: ChatCompletionTool;
}

interface ConnectedServer {
  name: string;
  client: Client;
  toolNames: Set<string>;
  toolDefs: McpToolDef[];
  connected: true;
}

interface FailedServer {
  name: string;
  error: string;
  connected: false;
}

type McpServer = ConnectedServer | FailedServer;

const servers: McpServer[] = [];

const builtinToolNames = new Set(
  builtinTools
    .filter((t): t is Extract<ChatCompletionTool, { type: "function" }> => t.type === "function")
    .map((t) => t.function.name),
);

function sanitizeToolName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (sanitized.length > MAX_NAME_LENGTH) {
    sanitized = sanitized.slice(0, MAX_NAME_LENGTH);
  }
  return sanitized;
}

export async function connectMcpServers(configs: Record<string, McpServerConfig>): Promise<void> {
  const entries = Object.entries(configs);
  if (entries.length === 0) return;

  // Clear any previous connections
  await disconnectMcpServers();

  // Track all registered MCP tool names across servers for collision detection
  const registeredMcpTools = new Set<string>();

  const results = await Promise.allSettled(
    entries.map(async ([name, config]) => {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env
          ? (Object.fromEntries(
              Object.entries({ ...process.env, ...config.env }).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ) as Record<string, string>)
          : undefined,
        stderr: "pipe",
      });

      const client = new Client({ name: "merc", version: "2.0.0" }, { capabilities: {} });

      await client.connect(transport, {
        timeout: CONNECT_TIMEOUT_MS,
      });

      const { tools } = await client.listTools();

      const toolDefs: McpToolDef[] = [];
      const toolNames = new Set<string>();

      for (const tool of tools) {
        let toolName = VALID_NAME_RE.test(tool.name) ? tool.name : sanitizeToolName(tool.name);

        if (toolName.length > MAX_NAME_LENGTH) {
          toolName = toolName.slice(0, MAX_NAME_LENGTH);
        }

        if (builtinToolNames.has(toolName)) {
          process.stderr.write(
            `[mcp] Warning: "${name}" tool "${toolName}" collides with built-in tool, skipping\n`,
          );
          continue;
        }

        if (registeredMcpTools.has(toolName)) {
          process.stderr.write(
            `[mcp] Warning: "${name}" tool "${toolName}" collides with another MCP server's tool, skipping\n`,
          );
          continue;
        }

        registeredMcpTools.add(toolName);
        toolNames.add(toolName);
        toolDefs.push({
          name: toolName,
          originalName: tool.name,
          def: {
            type: "function",
            function: {
              name: toolName,
              description: tool.description ?? "",
              parameters: (tool.inputSchema as Record<string, unknown>) ?? {
                type: "object",
                properties: {},
              },
            },
          },
        });
      }

      const server: ConnectedServer = {
        name,
        client,
        toolNames,
        toolDefs,
        connected: true,
      };
      servers.push(server);

      process.stderr.write(
        `[mcp] Connected "${name}" (${toolDefs.length} tool${toolDefs.length !== 1 ? "s" : ""})\n`,
      );
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result?.status === "rejected") {
      const name = entries[i]?.[0] ?? "unknown";
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      servers.push({ name, error, connected: false });
      process.stderr.write(`[mcp] Failed to connect "${name}": ${error}\n`);
    }
  }
}

export function getMcpToolDefs(): ChatCompletionTool[] {
  const defs: ChatCompletionTool[] = [];
  for (const server of servers) {
    if (server.connected) {
      for (const tool of server.toolDefs) {
        defs.push(tool.def);
      }
    }
  }
  return defs;
}

export function isMcpTool(name: string): boolean {
  for (const server of servers) {
    if (server.connected && server.toolNames.has(name)) {
      return true;
    }
  }
  return false;
}

function findServerForTool(name: string): ConnectedServer | undefined {
  for (const server of servers) {
    if (server.connected && server.toolNames.has(name)) {
      return server;
    }
  }
  return undefined;
}

function findOriginalName(server: ConnectedServer, sanitizedName: string): string {
  for (const tool of server.toolDefs) {
    if (tool.name === sanitizedName) return tool.originalName;
  }
  return sanitizedName;
}

function formatCallToolResult(result: {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}): string {
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  if (!result.content || result.content.length === 0) {
    return result.isError ? "Error: MCP tool returned an error with no content." : "(no output)";
  }

  const parts: string[] = [];
  for (const block of result.content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text);
        break;
      case "image":
        parts.push(`[Image: ${(block as { mimeType?: string }).mimeType ?? "unknown type"}]`);
        break;
      case "audio":
        parts.push(`[Audio: ${(block as { mimeType?: string }).mimeType ?? "unknown type"}]`);
        break;
      case "resource":
        parts.push(
          `[Resource: ${(block as { resource?: { uri?: string } }).resource?.uri ?? "unknown"}]`,
        );
        break;
      case "resource_link":
        parts.push(`[Resource Link: ${(block as { uri?: string }).uri ?? "unknown"}]`);
        break;
      default:
        parts.push(JSON.stringify(block));
    }
  }

  let output = parts.join("\n");
  if (output.length > 100_000) {
    output = `${output.slice(0, 100_000)}\n\n[output truncated at 100,000 characters]`;
  }

  if (result.isError) {
    output = `Error: ${output}`;
  }

  return output;
}

export async function callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  const server = findServerForTool(name);
  if (!server) {
    return `Error: No MCP server found for tool "${name}".`;
  }

  const originalName = findOriginalName(server, name);

  const result = await server.client.callTool({ name: originalName, arguments: args }, undefined, {
    timeout: CALL_TIMEOUT_MS,
  });

  return formatCallToolResult(
    result as {
      content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
    },
  );
}

export function getMcpStatus(): Array<{
  name: string;
  connected: boolean;
  tools: string[];
  error?: string;
}> {
  return servers.map((s) => {
    if (s.connected) {
      return {
        name: s.name,
        connected: true,
        tools: Array.from(s.toolNames),
      };
    }
    return {
      name: s.name,
      connected: false,
      tools: [],
      error: s.error,
    };
  });
}

export async function disconnectMcpServers(): Promise<void> {
  for (const server of servers) {
    if (server.connected) {
      try {
        await server.client.close();
      } catch {}
    }
  }
  servers.length = 0;
}
