import * as fs from "node:fs";
import * as path from "node:path";
import { CWD } from "./paths.ts";

export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(CWD, p);
}

export function isBinary(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function formatToolLabel(name: string, args: Record<string, any>): string {
  const rel = (p: string) => path.relative(CWD, resolvePath(p)) || p;
  switch (name) {
    case "read_file":
      return `read ${rel(args.path)}`;
    case "edit_file":
      return `edit ${rel(args.path)}`;
    case "write_file":
      return `write ${rel(args.path)}`;
    case "delete_file":
      return `delete ${rel(args.path)}`;
    case "rename_file":
      return `rename ${rel(args.old_path)} -> ${rel(args.new_path)}`;
    case "list_directory":
      return `ls ${rel(args.path ?? ".")}`;
    case "grep_search": {
      const extra = args.include ? ` (${args.include})` : "";
      return `grep ${args.pattern}${extra}`;
    }
    case "run_command": {
      const cmd = args.command.length > 50 ? `${args.command.slice(0, 50)}...` : args.command;
      return `run ${cmd}`;
    }
    case "web_search": {
      const q = args.query.length > 40 ? `${args.query.slice(0, 40)}...` : args.query;
      return `search ${q}`;
    }
    case "web_fetch": {
      const u = args.url.length > 50 ? `${args.url.slice(0, 50)}...` : args.url;
      return `fetch ${u}`;
    }
    case "use_skill":
      return `skill ${args.name ?? "?"}`;
    default:
      return `${name}(...)`;
  }
}
