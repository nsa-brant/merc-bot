import type OpenAI from "openai";
import { runHeadlessLoop } from "./headless-loop.ts";
import { backgroundTools } from "./tool-defs.ts";
import type { BackgroundAgent } from "./types.ts";

const agents = new Map<string, BackgroundAgent>();
let nextId = 1;
const MAX_CONCURRENT = 5;
const AGENT_TIMEOUT_MS = 2 * 60 * 1000;

export function createAgent(client: OpenAI, model: string, prompt: string): string {
  const runningCount = Array.from(agents.values()).filter((a) => a.status === "running").length;
  if (runningCount >= MAX_CONCURRENT) {
    throw new Error(
      `Maximum concurrent agents (${MAX_CONCURRENT}) reached. Cancel or wait for an agent to finish.`,
    );
  }

  const id = `agent-${nextId++}`;
  const abort = new AbortController();

  const agent: BackgroundAgent = {
    id,
    prompt,
    status: "running",
    createdAt: Date.now(),
    output: "",
    toolLog: [],
    abort,
  };

  agents.set(id, agent);

  const timeout = setTimeout(() => {
    if (agent.status === "running") {
      abort.abort();
      agent.status = "cancelled";
      agent.completedAt = Date.now();
      agent.error = "Agent timed out";
    }
  }, AGENT_TIMEOUT_MS);

  runHeadlessLoop(client, model, prompt, abort.signal, backgroundTools)
    .then((result) => {
      clearTimeout(timeout);
      if (agent.status !== "running") return;
      agent.status = "completed";
      agent.output = result.output;
      agent.toolLog = result.toolLog;
      agent.completedAt = Date.now();
      if (result.error) {
        agent.error = result.error;
      }
    })
    .catch((err) => {
      clearTimeout(timeout);
      if (agent.status !== "cancelled") {
        agent.status = "failed";
        agent.error = err instanceof Error ? err.message : String(err);
        agent.completedAt = Date.now();
      }
    });

  return id;
}

export function listAgents(): BackgroundAgent[] {
  return Array.from(agents.values());
}

export function getAgent(id: string): BackgroundAgent | null {
  return agents.get(id) ?? null;
}

export function cancelAgent(id: string): boolean {
  const agent = agents.get(id);
  if (agent && agent.status === "running") {
    agent.abort.abort();
    agent.status = "cancelled";
    agent.completedAt = Date.now();
    return true;
  }
  return false;
}
