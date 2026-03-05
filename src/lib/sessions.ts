import * as fs from "node:fs";
import * as path from "node:path";
import { CWD, SESSIONS_DIR } from "./paths.ts";
import type { ChatState } from "./types.ts";

export function saveSession(state: ChatState, name?: string): string {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const sessionName = name || `session-${Date.now()}`;
  const filePath = path.join(SESSIONS_DIR, `${sessionName}.json`);
  const data = {
    model: state.model,
    messages: state.messages,
    savedAt: new Date().toISOString(),
    cwd: CWD,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return sessionName;
}

export function loadSession(state: ChatState, name: string): { success: boolean; message: string } {
  const filePath = path.join(SESSIONS_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    return { success: false, message: `Session not found: ${name}` };
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  state.messages = data.messages;
  state.model = data.model || state.model;
  return {
    success: true,
    message: `Loaded: ${name} (${data.messages.length - 1} messages)`,
  };
}

export interface SessionInfo {
  name: string;
  messageCount: number;
  date: string;
}

export function listSessions(): SessionInfo[] {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const name = f.replace(".json", "");
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
      return {
        name,
        messageCount: (data.messages?.length || 1) - 1,
        date: data.savedAt ? new Date(data.savedAt).toLocaleDateString() : "?",
      };
    } catch {
      return { name, messageCount: 0, date: "?" };
    }
  });
}
