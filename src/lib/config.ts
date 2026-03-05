import * as fs from "node:fs";
import { CONFIG_DIR, CONFIG_FILE } from "./paths.ts";
import type { MercConfig } from "./types.ts";

let cachedConfig = (() => {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as MercConfig;
    const perms = fs.statSync(CONFIG_FILE).mode & 0o777;
    if (perms !== 0o600) {
      console.error(
        `Warning: ${CONFIG_FILE} has overly permissive permissions. Run: chmod 600 ${CONFIG_FILE}`,
      );
      fs.chmodSync(CONFIG_FILE, 0o600);
    }
    return data;
  } catch {
    return null;
  }
})();

export function loadConfig(): MercConfig | null {
  return cachedConfig;
}

export function saveConfig(config: MercConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  cachedConfig = config;
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
