import React, { useEffect } from "react";
import { Box, Text, Static, useApp } from "ink";
import Spinner from "ink-spinner";
import type OpenAI from "openai";
import type { CompletedItem } from "./lib/types.ts";
import MessageBlock from "./components/MessageBlock.tsx";
import StreamingResponse from "./components/StreamingResponse.tsx";
import DiffView from "./components/DiffView.tsx";
import ConfirmDialog from "./components/ConfirmDialog.tsx";
import { useChat } from "./hooks/useChat.ts";
import { useConfirm } from "./hooks/useConfirm.ts";
import { useAgentLoop } from "./hooks/useAgentLoop.ts";
import * as path from "node:path";

interface OneShotProps {
  client: OpenAI;
  defaultModel: string;
  prompt: string;
}

export default function OneShot({ client, defaultModel, prompt }: OneShotProps) {
  const { exit } = useApp();
  const chat = useChat(client, defaultModel);
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

  useEffect(() => {
    chat.updateClient(client);
  }, [client]);

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

  // Run on mount, exit when done
  useEffect(() => {
    runLoop(prompt).then(() => {
      setTimeout(() => exit(), 100);
    });
  }, []);

  return (
    <Box flexDirection="column">
      <Static items={chat.completedItems}>
        {(item: CompletedItem) => (
          <MessageBlock key={item.id} item={item} />
        )}
      </Static>

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

      {chat.deleteConfirmRequest && (
        <ConfirmDialog
          message={`Delete ${path.basename(chat.deleteConfirmRequest.filePath)}?`}
          onConfirm={handleDeleteConfirm}
          onDeny={handleDeleteDeny}
        />
      )}
    </Box>
  );
}
