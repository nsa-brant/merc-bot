import * as fs from "node:fs";
import { CONFIG_DIR, HISTORY_FILE } from "./paths.ts";

export function loadHistory(): string[] {
  try {
    return fs
      .readFileSync(HISTORY_FILE, "utf-8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function appendHistory(line: string) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.appendFileSync(HISTORY_FILE, line + "\n");
}
