import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface MercConfig {
  api_key: string;
  model?: string;
}

export interface ChatState {
  model: string;
  messages: ChatCompletionMessageParam[];
  client: OpenAI;
}

export interface StreamedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ConfirmFn = (
  filePath: string,
  oldContent: string,
  newContent: string,
) => Promise<boolean>;

export type DeleteConfirmFn = (filePath: string) => Promise<boolean>;

/** Input type for adding completed items (id is auto-generated) */
export type CompletedItemInput =
  | { type: "user"; content: string }
  | { type: "assistant"; content: string }
  | { type: "tool"; name: string; label: string; result: string; isWrite: boolean }
  | { type: "status"; content: string };

/** Items that have been completed and should go into Static scrollback */
export type CompletedItem = CompletedItemInput & { id: string };

/** Phases for the live rendering area */
export type Phase = "idle" | "thinking" | "streaming";

/** Pending confirmation request */
export interface ConfirmRequest {
  filePath: string;
  oldContent: string;
  newContent: string;
  resolve: (approved: boolean) => void;
}

export interface DeleteConfirmRequest {
  filePath: string;
  resolve: (approved: boolean) => void;
}

export type ConfirmRequestAny = ConfirmRequest | DeleteConfirmRequest;

/** Active tool call for live display */
export interface ActiveToolCall {
  name: string;
  label: string;
  result?: string;
  isWrite: boolean;
}

/** A background agent running a headless agent loop */
export interface BackgroundAgent {
  id: string;
  prompt: string;
  status: "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  completedAt?: number;
  output: string;
  toolLog: string[];
  error?: string;
  abort: AbortController;
}
