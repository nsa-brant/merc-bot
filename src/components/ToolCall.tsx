import { Text } from "ink";

interface ToolCallProps {
  label: string;
}

export default function ToolCall({ label }: ToolCallProps) {
  return <Text dimColor>├ ◆ {label}</Text>;
}
