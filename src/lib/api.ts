import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BASE_URL, MAX_RETRIES } from "./paths.ts";
import type { ChatState } from "./types.ts";
import { tools } from "./tools.ts";

export async function createClient(apiKey: string): Promise<OpenAI> {
  return new OpenAI({ apiKey, baseURL: BASE_URL });
}

export async function apiCallWithRetry(
  state: ChatState,
  toolDefs: ChatCompletionTool[] = tools
): Promise<AsyncIterable<any>> {
  let lastErr: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await state.client.chat.completions.create({
        model: state.model,
        messages: state.messages,
        tools: toolDefs,
        tool_choice: "auto",
        max_tokens: 4096,
        stream: true,
      });
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
