import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import { GLOBAL_SKILLS_DIR, LOCAL_SKILLS_DIR } from "./paths.ts";

export interface SkillMeta {
  name: string;
  description: string;
  dir: string;
  skillFile: string;
  source: "global" | "local";
}

export type SkillRegistry = Map<string, SkillMeta>;

const MAX_SKILL_BODY = 8000;
const MAX_PROMPT_SKILLS = 10;

function scanDir(dir: string, source: "global" | "local", registry: SkillRegistry): void {
  if (!fs.existsSync(dir)) return;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const skillDir = path.join(dir, entry);
    try {
      if (!fs.statSync(skillDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    let content: string;
    try {
      content = fs.readFileSync(skillFile, "utf-8");
    } catch {
      continue;
    }
    try {
      const { data } = matter(content);
      const name = typeof data.name === "string" ? data.name : undefined;
      const description = typeof data.description === "string" ? data.description : undefined;
      if (!name || !description) continue;
      registry.set(name.toLowerCase(), {
        name,
        description,
        dir: skillDir,
        skillFile,
        source,
      });
    } catch {}
  }
}

export function loadSkills(): SkillRegistry {
  const registry: SkillRegistry = new Map();
  try {
    // Global first (lower precedence)
    scanDir(GLOBAL_SKILLS_DIR, "global", registry);
    // Local second (overwrites on name collision)
    scanDir(LOCAL_SKILLS_DIR, "local", registry);
  } catch {
    // Non-fatal — return whatever we have
  }
  return registry;
}

export function reloadSkills(registry: SkillRegistry): void {
  registry.clear();
  try {
    scanDir(GLOBAL_SKILLS_DIR, "global", registry);
    scanDir(LOCAL_SKILLS_DIR, "local", registry);
  } catch {
    // Non-fatal
  }
}

export function buildSkillsPromptSection(registry: SkillRegistry): string {
  const lines = [
    "",
    "## Skills",
    "",
    "You support an extensible skills system. Skills are user-installed extensions (from the agentskills.io open standard) that give you specialized capabilities. Users manage skills with the /skills slash command:",
    "- `/skills` — list installed skills",
    "- `/skills add <owner/repo>` — install a skill from GitHub",
    "- `/skills remove <name>` — uninstall a skill",
    "",
  ];

  if (registry.size === 0) {
    lines.push(
      "No skills are currently installed. If the user asks about skills, explain the system and how to install them.",
    );
  } else {
    lines.push(
      "When a user's request matches a skill's purpose, use the `use_skill` tool to load its full instructions before acting.",
    );
    lines.push("");
    lines.push("Installed skills:");
    let count = 0;
    for (const [, skill] of registry) {
      if (count >= MAX_PROMPT_SKILLS) {
        lines.push(`- ... and ${registry.size - MAX_PROMPT_SKILLS} more (use /skills to see all)`);
        break;
      }
      lines.push(`- **${skill.name}**: ${skill.description}`);
      count++;
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function executeUseSkill(name: string, registry: SkillRegistry): Promise<string> {
  const key = name.toLowerCase().trim();
  const skill = registry.get(key);
  if (!skill) {
    const available = [...registry.keys()].join(", ") || "none";
    return `Skill not found: "${name}". Available skills: ${available}`;
  }

  let content: string;
  try {
    content = fs.readFileSync(skill.skillFile, "utf-8");
  } catch {
    return `Error reading skill file: ${skill.skillFile}`;
  }

  let body: string;
  try {
    body = matter(content).content.trim();
  } catch {
    body = content;
  }

  if (body.length > MAX_SKILL_BODY) {
    const cutIdx = body.lastIndexOf("\n", MAX_SKILL_BODY);
    body =
      body.slice(0, cutIdx > 0 ? cutIdx : MAX_SKILL_BODY) +
      "\n\n[Truncated — skill instructions exceed 8000 chars]";
  }

  // List associated files
  const subdirs = ["references", "scripts", "assets"];
  const fileLines: string[] = [];
  for (const sub of subdirs) {
    const subDir = path.join(skill.dir, sub);
    if (!fs.existsSync(subDir)) continue;
    try {
      const files = fs.readdirSync(subDir).filter((f) => !f.startsWith("."));
      for (const f of files) {
        fileLines.push(`${sub}/${f}`);
      }
    } catch {}
  }

  let result = `# Skill: ${skill.name}\n\n${body}`;
  if (fileLines.length > 0) {
    result += `\n\n## Associated Files (in ${skill.dir})\n\n${fileLines.map((f) => `- ${f}`).join("\n")}`;
  }
  return result;
}
