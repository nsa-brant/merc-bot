import { Box, Text } from "ink";

interface StreamingResponseProps {
  text: string;
}

export default function StreamingResponse({ text }: StreamingResponseProps) {
  if (!text) return null;

  const lines = text.split("\n");
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
