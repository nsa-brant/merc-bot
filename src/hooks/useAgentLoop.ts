import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { useCallback } from "react";
import { apiCallWithRetry } from "../lib/api.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { getMcpToolDefs } from "../lib/mcp.ts";
import { tools } from "../lib/tool-defs.ts";
import { executeTool, formatToolLabel } from "../lib/tools.ts";
import type {
  ActiveToolCall,
  ChatState,
  CompletedItemInput,
  ConfirmFn,
  DeleteConfirmFn,
  Phase,
  StreamedToolCall,
} from "../lib/types.ts";
import { buildSystemPrompt } from "./useChat.ts";

const MAX_ITERATIONS = 15;

interface AgentLoopDeps {
  getState: () => ChatState;
  setPhase: (phase: Phase) => void;
  setStreamText: (text: string) => void;
  setToolCalls: (calls: ActiveToolCall[]) => void;
  addToolCall: (tc: ActiveToolCall) => void;
  addCompleted: (item: CompletedItemInput) => void;
  confirm: ConfirmFn;
  deleteConfirm: DeleteConfirmFn;
}

export function useAgentLoop(deps: AgentLoopDeps) {
  const runLoop = useCallback(
    async (userMessage?: string) => {
      const state = deps.getState();

      // Refresh system prompt to include any newly-connected MCP tools
      state.messages[0] = { role: "system", content: buildSystemPrompt() };

      if (userMessage) {
        state.messages.push({ role: "user", content: userMessage });
        deps.addCompleted({ type: "user", content: userMessage });
      }

      let hitLimit = false;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        let textContent = "";
        const toolCalls: StreamedToolCall[] = [];

        try {
          deps.setPhase("thinking");
          deps.setStreamText("");
          deps.setToolCalls([]);

          const allTools = [...tools, ...getMcpToolDefs()];
          const stream = await apiCallWithRetry(state, allTools);

          let startedStreaming = false;

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              if (!startedStreaming) {
                deps.setPhase("streaming");
                startedStreaming = true;
              }
              textContent += delta.content;
              // Render markdown in real-time for streaming display
              const rendered = renderMarkdown(textContent);
              deps.setStreamText(rendered);
            }

            if (delta.tool_calls) {
              if (!startedStreaming) {
                deps.setPhase("streaming");
                startedStreaming = true;
              }
              for (const tc of delta.tool_calls) {
                if (tc.index !== undefined) {
                  while (toolCalls.length <= tc.index) {
                    toolCalls.push({ id: "", name: "", arguments: "" });
                  }
                  if (tc.id) toolCalls[tc.index]!.id = tc.id;
                  if (tc.function?.name) toolCalls[tc.index]!.name = tc.function.name;
                  if (tc.function?.arguments)
                    toolCalls[tc.index]!.arguments += tc.function.arguments;
                }
              }
            }
          }
        } catch (err: any) {
          deps.setPhase("idle");
          deps.addCompleted({
            type: "status",
            content: `✗ API error: ${err.message}`,
          });
          return;
        }

        // Add text response to completed items
        if (textContent) {
          deps.addCompleted({ type: "assistant", content: textContent });
          deps.setStreamText("");
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

            const label = formatToolLabel(tc.name, fnArgs);
            const isWrite =
              tc.name === "write_file" || tc.name === "edit_file" || tc.name === "delete_file";

            // Show tool call in live area
            deps.addToolCall({ name: tc.name, label, isWrite });

            const result = await executeTool(
              tc.name,
              fnArgs,
              deps.confirm,
              deps.deleteConfirm,
              state,
            );

            // Move to completed and update live area
            deps.addCompleted({
              type: "tool",
              name: tc.name,
              label,
              result,
              isWrite,
            });

            state.messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            } as ChatCompletionMessageParam);
          }

          deps.setToolCalls([]);

          if (i === MAX_ITERATIONS - 1) {
            hitLimit = true;
          }

          continue; // loop again for more tool calls or final response
        }

        break; // no tool calls, done
      }

      if (hitLimit) {
        deps.addCompleted({
          type: "status",
          content: `⚠ Agent loop reached maximum ${MAX_ITERATIONS} iterations. The task may be incomplete.`,
        });
      }

      deps.setPhase("idle");
    },
    [deps],
  );

  return { runLoop };
}
