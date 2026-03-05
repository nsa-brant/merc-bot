import * as path from "node:path";
import { diffLines } from "diff";
import { CWD } from "./paths.ts";

export interface DiffLine {
  type: "added" | "removed" | "context";
  text: string;
}

export interface DiffResult {
  relativePath: string;
  lines: DiffLine[];
  truncated: boolean;
}

const MAX_DIFF_LINES = 80;

export function computeDiff(filePath: string, oldContent: string, newContent: string): DiffResult {
  const rel = path.relative(CWD, filePath) || filePath;
  const changes = diffLines(oldContent, newContent);
  const lines: DiffLine[] = [];
  let lineCount = 0;
  let truncated = false;

  for (const part of changes) {
    if (lineCount >= MAX_DIFF_LINES) {
      truncated = true;
      break;
    }
    const partLines = part.value.replace(/\n$/, "").split("\n");
    for (const line of partLines) {
      if (lineCount >= MAX_DIFF_LINES) {
        truncated = true;
        break;
      }
      if (part.added) {
        lines.push({ type: "added", text: line });
        lineCount++;
      } else if (part.removed) {
        lines.push({ type: "removed", text: line });
        lineCount++;
      }
      // context lines are skipped (same as original)
    }
  }

  return { relativePath: rel, lines, truncated };
}
