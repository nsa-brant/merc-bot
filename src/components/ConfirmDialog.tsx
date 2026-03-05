import { Text, useInput } from "ink";

interface ConfirmDialogProps {
  message?: string;
  onConfirm: () => void;
  onDeny: () => void;
}

export default function ConfirmDialog({
  message = "Apply?",
  onConfirm,
  onDeny,
}: ConfirmDialogProps) {
  useInput((input) => {
    const lower = input.toLowerCase();
    if (lower === "y") {
      onConfirm();
    } else if (lower === "n") {
      onDeny();
    }
  });

  return (
    <Text>
      {" "}
      <Text color="green">y</Text>
      <Text dimColor>/</Text>
      <Text color="red">n</Text>
      <Text dimColor> {message} </Text>
    </Text>
  );
}
