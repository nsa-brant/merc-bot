import React, { useState, useEffect } from "react";
import { Box, Text, Static } from "ink";
import Spinner from "ink-spinner";
import type OpenAI from "openai";
import type { CompletedItem } from "./lib/types.ts";
import Banner from "./components/Banner.tsx";
import MessageBlock from "./components/MessageBlock.tsx";
import StreamingResponse from "./components/StreamingResponse.tsx";
import DiffView from "./components/DiffView.tsx";
import ConfirmDialog from "./components/ConfirmDialog.tsx";
import Prompt from "./components/Prompt.tsx";
import { useChat } from "./hooks/useChat.ts";
import { useConfirm } from "./hooks/useConfirm.ts";
import { useHistory } from "./hooks/useHistory.ts";
import { useSlashCommands } from "./hooks/useSlashCommands.ts";
import { useAgentLoop } from "./hooks/useAgentLoop.ts";
import * as path from "node:path";

interface AppProps {
  client: OpenAI;
  defaultModel: string;
}

export default function App({ client, defaultModel }: AppProps) {
  const chat = useChat(client, defaultModel);
  const { history, addEntry } = useHistory();
  const {
    confirm,
    deleteConfirm,
    handleConfirm,
    handleDeny,
    handleDeleteConfirm,
    handleDeleteDeny,
  } = useConfirm(
    chat.setConfirmRequest,
    chat.setDeleteConfirmRequest,
    chat.confirmRequest,
    chat.deleteConfirmRequest
  );

  // Set client on mount
  useEffect(() => {
    chat.updateClient(client);
  }, [client]);

  const { handleCommand } = useSlashCommands({
    getState: chat.getState,
    setModel: chat.setModel,
    addCompleted: chat.addCompleted,
    clearConversation: chat.clearConversation,
    updateClient: chat.updateClient,
    model: chat.model,
  });

  const { runLoop } = useAgentLoop({
    getState: chat.getState,
    setPhase: chat.setPhase,
    setStreamText: chat.setStreamText,
    setToolCalls: chat.setToolCalls,
    addToolCall: chat.addToolCall,
    addCompleted: chat.addCompleted,
    confirm,
    deleteConfirm,
  });

  // SIGINT handling
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => {
    const handler = () => {
      if (interrupted) {
        process.exit(0);
      }
      setInterrupted(true);
      chat.addCompleted({ type: "status", content: "Ctrl+C again to exit." });
      setTimeout(() => setInterrupted(false), 2000);
    };
    process.on("SIGINT", handler);
    return () => {
      process.removeListener("SIGINT", handler);
    };
  }, [interrupted]);

  const handleSubmit = (input: string) => {
    addEntry(input);

    if (handleCommand(input)) {
      return;
    }

    runLoop(input);
  };

  return (
    <Box flexDirection="column">
      <Banner model={chat.model} />

      {/* Scrollback: completed messages */}
      <Static items={chat.completedItems}>
        {(item: CompletedItem) => (
          <MessageBlock key={item.id} item={item} />
        )}
      </Static>

      {/* Live area: hidden when confirm dialog is showing */}
      {chat.phase === "thinking" && !chat.confirmRequest && !chat.deleteConfirmRequest && (
        <Text>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> thinking</Text>
        </Text>
      )}

      {chat.phase === "streaming" && !chat.confirmRequest && !chat.deleteConfirmRequest && (
        <StreamingResponse text={chat.streamText} />
      )}

      {/* Confirm dialog for file writes/edits */}
      {chat.confirmRequest && (
        <Box flexDirection="column">
          <DiffView
            filePath={chat.confirmRequest.filePath}
            oldContent={chat.confirmRequest.oldContent}
            newContent={chat.confirmRequest.newContent}
          />
          <ConfirmDialog
            message="Apply?"
            onConfirm={handleConfirm}
            onDeny={handleDeny}
          />
        </Box>
      )}

      {/* Confirm dialog for deletes */}
      {chat.deleteConfirmRequest && (
        <ConfirmDialog
          message={`Delete ${path.basename(chat.deleteConfirmRequest.filePath)}?`}
          onConfirm={handleDeleteConfirm}
          onDeny={handleDeleteDeny}
        />
      )}

      {/* Prompt: only when idle and no pending confirmations */}
      {chat.phase === "idle" &&
        !chat.confirmRequest &&
        !chat.deleteConfirmRequest && (
          <Prompt onSubmit={handleSubmit} history={history} />
        )}
    </Box>
  );
}
