import React from "react";
import { Box, Text } from "ink";
import { VERSION, CWD, COLS } from "../lib/paths.ts";
import * as path from "node:path";

interface BannerProps {
  model: string;
}

export default function Banner({ model }: BannerProps) {
  const width = Math.min(COLS, 80);
  const hr = "─".repeat(width);
  return (
    <Box flexDirection="column">
      <Text dimColor>{hr}</Text>
      <Text>
        {"  "}
        <Text color="cyan" bold>
          ⚡ merc
        </Text>
        <Text dimColor> v{VERSION}</Text>
        <Text dimColor> · </Text>
        <Text>{model}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{path.basename(CWD)}</Text>
      </Text>
      <Text dimColor>{hr}</Text>
      <Text> </Text>
    </Box>
  );
}
