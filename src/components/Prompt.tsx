import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

interface PromptProps {
  onSubmit: (input: string) => void;
  history: string[];
}

export default function Prompt({ onSubmit, history }: PromptProps) {
  const [value, setValue] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedInput, setSavedInput] = useState("");

  useInput((_input, key) => {
    if (key.upArrow && history.length > 0) {
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);

      if (historyIndex === -1) {
        setSavedInput(value);
      }
      setHistoryIndex(newIndex);
      setValue(history[newIndex] ?? "");
    }
    if (key.downArrow) {
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setValue(savedInput);
      } else {
        setHistoryIndex(newIndex);
        setValue(history[newIndex] ?? "");
      }
    }
  });

  const handleSubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setValue("");
    setHistoryIndex(-1);
    setSavedInput("");
    onSubmit(trimmed);
  };

  return (
    <Box>
      <Text color="cyan">› </Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Box>
  );
}
