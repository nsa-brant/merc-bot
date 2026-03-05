import * as fs from "node:fs";
import { CONFIG_DIR, CONFIG_FILE } from "./paths.ts";
import type { MercConfig } from "./types.ts";

const cachedConfig = (() => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as MercConfig;
  } catch {
    return null;
  }
})();

export function loadConfig(): MercConfig | null {
  return cachedConfig;
}

export function saveConfig(config: MercConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function getDefaultModel(): string {
  return process.env.MERCURY_MODEL ?? cachedConfig?.model ?? "mercury-2";
}

export async function getApiKey(): Promise<string> {
  if (process.env.INCEPTION_API_KEY) return process.env.INCEPTION_API_KEY;
  const config = loadConfig();
  if (config?.api_key) return config.api_key;
  // In ink mode, API key setup is handled by the App component
  // This fallback is for non-interactive usage
  throw new Error("No API key found. Set INCEPTION_API_KEY env var or run merc interactively.");
}
