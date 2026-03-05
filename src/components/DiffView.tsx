import React from "react";
import { Box, Text } from "ink";
import { computeDiff } from "../lib/diff.ts";
import { COLS } from "../lib/paths.ts";

interface DiffViewProps {
  filePath: string;
  oldContent: string;
  newContent: string;
}

export default function DiffView({
  filePath,
  oldContent,
  newContent,
}: DiffViewProps) {
  const diff = computeDiff(filePath, oldContent, newContent);
  const hr = "─".repeat(Math.min(COLS, 80));

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text bold color="white">
        {" "}📄 {diff.relativePath}
      </Text>
      <Text dimColor>{hr}</Text>
      {diff.lines.map((line, i) => {
        if (line.type === "added") {
          return (
            <Text key={i} color="green">
              {" "}+ {line.text}
            </Text>
          );
        }
        return (
          <Text key={i} color="red">
            {" "}- {line.text}
          </Text>
        );
      })}
      {diff.truncated && <Text dimColor>  … diff truncated</Text>}
      <Text dimColor>{hr}</Text>
    </Box>
  );
}
