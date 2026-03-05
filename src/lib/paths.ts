import * as path from "node:path";
import * as os from "node:os";

export const VERSION = "2.0.0";
export const CONFIG_DIR = path.join(os.homedir(), ".config", "merc");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
export const HISTORY_FILE = path.join(CONFIG_DIR, "history");
export const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
export const BASE_URL = "https://api.inceptionlabs.ai/v1";
export const CWD = process.cwd();
export const MAX_RETRIES = 3;
export const COLS = process.stdout.columns || 80;
export const DEFAULT_MODEL =
  process.env.MERCURY_MODEL ?? "mercury-2"; // config override applied in config.ts
