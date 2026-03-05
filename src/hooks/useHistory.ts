import { useEffect, useState } from "react";
import { appendHistory, loadHistory } from "../lib/history.ts";

export function useHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory().slice(-100));
  }, []);

  const addEntry = (line: string) => {
    appendHistory(line);
    setHistory((prev) => [...prev.slice(-99), line]);
  };

  return { history, addEntry };
}
