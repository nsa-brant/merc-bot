import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { apiCallWithRetry } from "./api.ts";
import { CWD } from "./paths.ts";
import { executeTool } from "./tool-exec.ts";
import { formatToolLabel } from "./tool-utils.ts";
import type { ChatState, StreamedToolCall } from "./types.ts";

const MAX_ITERATIONS = 15;
const MAX_OUTPUT_LENGTH = 50_000;

const SYSTEM_PROMPT = `You are Mercury, a background AI coding agent. You are running as a sub-agent to handle a specific task autonomously.
You have tools to read, edit, write files, list directories, search code, run commands, and search/fetch the web.
Current working directory: ${CWD}
Be concise and focused on completing the assigned task. Report your findings clearly.`;

export interface HeadlessResult {
  output: string;
  toolLog: string[];
  error?: string;
}

export async function runHeadlessLoop(
  client: OpenAI,
  model: string,
  prompt: string,
  signal: AbortSignal,
  toolDefs: ChatCompletionTool[],
): Promise<HeadlessResult> {
  const toolLog: string[] = [];
  let output = "";

  try {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const state: ChatState = { model, messages, client };

    // Auto-approve file writes/edits in headless mode
    const confirm = async () => true;
    // Reject dangerous commands (deleteConfirm is used for dangerous command prompts)
    const deleteConfirm = async () => false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (signal.aborted) break;

      let textContent = "";
      const toolCalls: StreamedToolCall[] = [];

      try {
        const stream = await apiCallWithRetry(state, toolDefs);

        for await (const chunk of stream) {
          if (signal.aborted) break;

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            textContent += delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                while (toolCalls.length <= tc.index) {
                  toolCalls.push({ id: "", name: "", arguments: "" });
                }
                if (tc.id) toolCalls[tc.index]!.id = tc.id;
                if (tc.function?.name) toolCalls[tc.index]!.name = tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index]!.arguments += tc.function.arguments;
              }
            }
          }
        }
      } catch (err: any) {
        return {
          output,
          toolLog,
          error: `API error: ${err.message}`,
        };
      }

      if (signal.aborted) break;

      // Accumulate text output
      if (textContent) {
        output += textContent;
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
          if (signal.aborted) break;

          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(tc.arguments);
          } catch {}

          const label = formatToolLabel(tc.name, fnArgs);
          toolLog.push(`${tc.name}: ${label}`);

          const result = await executeTool(tc.name, fnArgs, confirm, deleteConfirm);

          state.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          } as ChatCompletionMessageParam);
        }

        continue; // loop again for more tool calls or final response
      }

      break; // no tool calls, done
    }

    // Truncate output if it exceeds the cap
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = `${output.slice(0, MAX_OUTPUT_LENGTH)}\n\n[output truncated at 50,000 characters]`;
    }

    return { output, toolLog };
  } catch (err: any) {
    return {
      output,
      toolLog,
      error: err.message,
    };
  }
}
