import React from "react";
import { Box, Text } from "ink";
import type { CompletedItem } from "../lib/types.ts";
import { renderMarkdown } from "../lib/markdown.ts";

interface MessageBlockProps {
  item: CompletedItem;
}

export default function MessageBlock({ item }: MessageBlockProps) {
  switch (item.type) {
    case "user":
      return (
        <Box flexDirection="column">
          <Text> </Text>
          <Text color="green" bold>
            {"  ▹ "}
            {item.content}
          </Text>
        </Box>
      );

    case "assistant": {
      const rendered = renderMarkdown(item.content);
      const collapsed = rendered.replace(/\n{3,}/g, "\n\n");
      const tightened = collapsed.replace(/\n\n(\s*[*\-•])/g, "\n$1");
      const lines = tightened.split("\n");

      return (
        <Box flexDirection="column">
          <Text> </Text>
          {lines.map((line, i) => (
            <Text key={i}>
              <Text color="cyan">│ </Text>
              {line}
            </Text>
          ))}
          <Text> </Text>
        </Box>
      );
    }

    case "tool":
      return (
        <Box flexDirection="column">
          <Text dimColor>├ ◆ {item.label}</Text>
          {!item.isWrite && item.result && (
            <>
              {item.result
                .split("\n")
                .slice(0, 3)
                .map((line, i) => {
                  const trimmed =
                    line.length > 120 ? line.slice(0, 120) + "…" : line;
                  return (
                    <Text key={i} dimColor>
                      │   {trimmed}
                    </Text>
                  );
                })}
              {item.result.split("\n").length > 3 && (
                <Text dimColor>
                  │   … {item.result.split("\n").length - 3} more lines
                </Text>
              )}
            </>
          )}
          {item.isWrite && item.result && (
            <Text dimColor>  {item.result}</Text>
          )}
        </Box>
      );

    case "status":
      return <Text dimColor>  {item.content}</Text>;

    default:
      return null;
  }
}
