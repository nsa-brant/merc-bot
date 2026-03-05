import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { saveConfig } from "../lib/config.ts";

interface ApiKeySetupProps {
  onKeySet: (key: string) => void;
}

export default function ApiKeySetup({ onKeySet }: ApiKeySetupProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (val: string) => {
    const key = val.trim();
    if (!key) return;
    saveConfig({ api_key: key });
    onKeySet(key);
  };

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text color="cyan" bold>
        {"  "}Mercury — first-time setup
      </Text>
      <Text dimColor>{"  "}Get your API key at https://platform.inceptionlabs.ai</Text>
      <Text> </Text>
      <Box>
        <Text color="yellow">{"  "}API key: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
