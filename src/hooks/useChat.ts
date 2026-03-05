import { useState, useCallback, useRef, useMemo } from "react";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type OpenAI from "openai";
import type {
  ChatState,
  CompletedItem,
  CompletedItemInput,
  Phase,
  ActiveToolCall,
  ConfirmRequest,
  DeleteConfirmRequest,
} from "../lib/types.ts";
import { CWD } from "../lib/paths.ts";

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

export function useChat(client: OpenAI, defaultModel: string) {
  const [model, setModel] = useState(defaultModel);
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamText, setStreamText] = useState("");
  const [toolCalls, setToolCalls] = useState<ActiveToolCall[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null
  );
  const [deleteConfirmRequest, setDeleteConfirmRequest] =
    useState<DeleteConfirmRequest | null>(null);

  const stateRef = useRef<ChatState>({
    model: defaultModel,
    messages: [{ role: "system", content: SYSTEM_PROMPT }],
    client,
  });

  // Keep stateRef in sync with model changes
  const updateModel = useCallback((newModel: string) => {
    setModel(newModel);
    stateRef.current.model = newModel;
  }, []);

  const updateClient = useCallback((newClient: OpenAI) => {
    stateRef.current.client = newClient;
  }, []);

  const idCounter = useRef(0);
  const nextId = useCallback(() => `item-${++idCounter.current}`, []);

  const addCompleted = useCallback((item: CompletedItemInput) => {
    setCompletedItems((prev) => [...prev, { ...item, id: nextId() }]);
  }, [nextId]);

  const clearConversation = useCallback(() => {
    stateRef.current.messages = [stateRef.current.messages[0]!];
    setCompletedItems([]);
  }, []);

  const addToolCall = useCallback((tc: ActiveToolCall) => {
    setToolCalls((prev) => [...prev, tc]);
  }, []);

  const getState = useCallback(() => stateRef.current, []);

  return {
    model,
    setModel: updateModel,
    updateClient,
    completedItems,
    addCompleted,
    clearConversation,
    phase,
    setPhase,
    streamText,
    setStreamText,
    toolCalls,
    setToolCalls,
    addToolCall,
    confirmRequest,
    setConfirmRequest,
    deleteConfirmRequest,
    setDeleteConfirmRequest,
    getState,
  };
}
