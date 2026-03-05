import React from "react";
import { Box, Text } from "ink";

interface ToolResultProps {
  text: string;
}

export default function ToolResult({ text }: ToolResultProps) {
  const allLines = text.split("\n");
  const displayLines = allLines.slice(0, 3);
  const remaining = allLines.length - 3;

  return (
    <Box flexDirection="column">
      {displayLines.map((line, i) => {
        const trimmed = line.length > 120 ? line.slice(0, 120) + "…" : line;
        return (
          <Text key={i} dimColor>
            │   {trimmed}
          </Text>
        );
      })}
      {remaining > 0 && (
        <Text dimColor>│   … {remaining} more lines</Text>
      )}
    </Box>
  );
}
