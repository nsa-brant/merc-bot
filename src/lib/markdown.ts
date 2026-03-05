import chalk from "chalk";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { COLS } from "./paths.ts";

// Reserve: "│ " (2) + list indent (4) + margin (2)
const CONTENT_WIDTH = Math.min(COLS - 10, 76);

const terminalOpts = markedTerminal({
  reflowText: true,
  width: CONTENT_WIDTH,
  tab: 2,
  showSectionPrefix: false,
  unescape: true,
}) as any;

const originalRenderer = terminalOpts.renderer ?? {};

// Custom hr — use ─ instead of dashes
originalRenderer.hr = (): string => {
  return "\n" + chalk.dim("─".repeat(Math.min(CONTENT_WIDTH, 60))) + "\n";
};

// Custom table — card layout for wide/many-column tables
originalRenderer.table = (token: any): string => {
  const rows: string[][] = [];
  const headers: string[] = [];

  const stripMd = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .trim();

  if (token.header) {
    for (const cell of token.header) {
      const text =
        cell.tokens?.map((t: any) => t.raw ?? t.text ?? "").join("") ?? "";
      headers.push(stripMd(text));
    }
  }
  if (token.rows) {
    for (const row of token.rows) {
      const cells: string[] = [];
      for (const cell of row) {
        const text =
          cell.tokens?.map((t: any) => t.raw ?? t.text ?? "").join("") ?? "";
        cells.push(stripMd(text));
      }
      rows.push(cells);
    }
  }

  const colCount = Math.max(headers.length, ...rows.map((r) => r.length));

  // Card layout for 4+ columns or wide content
  const longestCell = Math.max(
    0,
    ...headers.map((h) => h.length),
    ...rows.flatMap((r) => r.map((c) => c.length))
  );

  if (longestCell > 35 || colCount >= 4) {
    let out = "\n";
    for (let ri = 0; ri < rows.length; ri++) {
      if (ri > 0) out += "\n";
      for (let ci = 0; ci < colCount; ci++) {
        const label = headers[ci] || `Col ${ci + 1}`;
        const value = rows[ri]?.[ci] || "";
        if (!value) continue;
        out += `  ${chalk.cyan.bold(label)}: ${value}\n`;
      }
    }
    return out + "\n";
  }

  // Compact table for small data
  const widths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    const headerW = headers[i]?.length ?? 0;
    const maxCellW = Math.max(0, ...rows.map((r) => (r[i]?.length ?? 0)));
    widths.push(Math.max(headerW, maxCellW) + 2);
  }

  const maxTableWidth = CONTENT_WIDTH;
  const totalW = widths.reduce((a, b) => a + b, 0) + (colCount - 1) * 3;
  if (totalW > maxTableWidth) {
    const ratio = maxTableWidth / totalW;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.max(6, Math.floor(widths[i]! * ratio));
    }
  }

  const truncPad = (s: string, w: number) => {
    if (s.length > w) return s.slice(0, w - 1) + "…";
    return s + " ".repeat(Math.max(0, w - s.length));
  };

  const sep = widths.map((w) => "─".repeat(w)).join("─┬─");
  let out = "\n";

  if (headers.length) {
    out +=
      chalk.bold(headers.map((h, i) => truncPad(h, widths[i]!)).join(" │ ")) +
      "\n";
    out += chalk.dim(sep) + "\n";
  }

  for (const row of rows) {
    out +=
      row.map((c, i) => truncPad(c, widths[i]!)).join(chalk.dim(" │ ")) + "\n";
  }

  return out + "\n";
};

const marked = new Marked({ renderer: originalRenderer, ...terminalOpts });

// Strip ANSI codes for visible-width measurement
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

export function renderMarkdown(text: string): string {
  let out = (marked.parse(text) as string).trimEnd();

  // Strip any leftover raw ### heading prefixes
  out = out.replace(/^(#{1,6})\s+/gm, "");

  // Fix bullet markers: marked-terminal renders italic-space (\x1b[3m \x1b[23m)
  // Replace with clean bullet
  out = out.replace(/\x1b\[3m\s*\x1b\[23m/g, "• ");
  // Also fix any raw "* " at line start that didn't get rendered
  out = out.replace(/^(\s*)\*\s+/gm, "$1• ");

  // Catch any leftover raw **bold**
  out = out.replace(/\*\*(.+?)\*\*/g, chalk.bold("$1"));
  // Catch leftover *italic*
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, chalk.italic("$1"));

  // Collapse excessive blank lines (3+ → 1)
  out = out.replace(/\n{3,}/g, "\n\n");
  // Tighten bullet lists — remove blank lines between items
  out = out.replace(/\n\n(\s*•)/g, "\n$1");

  // Hard-wrap lines that exceed content width to prevent
  // terminal-level wrapping (which loses the │ prefix)
  const maxW = CONTENT_WIDTH;
  const lines = out.split("\n");
  const wrapped: string[] = [];
  for (const line of lines) {
    const visLen = stripAnsi(line).length;
    if (visLen <= maxW) {
      wrapped.push(line);
    } else {
      // Detect leading indent to preserve on continuation lines
      const indentMatch = stripAnsi(line).match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1]! : "";
      const contIndent = indent + "  ";

      const words = line.split(/( +)/);
      let current = "";
      let currentLen = 0;
      let isFirst = true;
      for (const word of words) {
        const wordLen = stripAnsi(word).length;
        if (currentLen + wordLen > maxW && currentLen > 0) {
          wrapped.push(current);
          current = isFirst ? contIndent + word.trimStart() : contIndent + word.trimStart();
          currentLen = stripAnsi(current).length;
          isFirst = false;
        } else {
          current += word;
          currentLen += wordLen;
        }
      }
      if (current) wrapped.push(current);
    }
  }
  return wrapped.join("\n");
}
