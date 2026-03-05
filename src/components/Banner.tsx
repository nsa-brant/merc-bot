import * as path from "node:path";
import { Box, Text } from "ink";
import { COLS, CWD, VERSION } from "../lib/paths.ts";

interface BannerProps {
  model: string;
  cookMode?: boolean;
}

export default function Banner({ model, cookMode = false }: BannerProps) {
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
        {cookMode && (
          <>
            <Text dimColor> · </Text>
            <Text color="yellow" bold>
              cook
            </Text>
          </>
        )}
      </Text>
      <Text dimColor>{hr}</Text>
      <Text> </Text>
    </Box>
  );
}
