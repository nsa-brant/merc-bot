import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file. Use absolute paths or paths relative to the working directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Make a surgical edit to a file by replacing an exact string match. " +
        "Provide the old_string to find and new_string to replace it with. " +
        "The old_string must match exactly (including whitespace/indentation). " +
        "Use replace_all: true to replace every occurrence.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          old_string: {
            type: "string",
            description: "Exact string to find in the file",
          },
          new_string: {
            type: "string",
            description: "Replacement string",
          },
          replace_all: {
            type: "boolean",
            description: "Replace all occurrences (default: false)",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write content to a file (full overwrite). Creates parent directories if needed. " +
        "Prefer edit_file for modifying existing files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "Full file content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or empty directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory path to delete",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file or directory.",
      parameters: {
        type: "object",
        properties: {
          old_path: { type: "string", description: "Current path" },
          new_path: { type: "string", description: "New path" },
        },
        required: ["old_path", "new_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories. Returns names with / suffix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path (defaults to cwd)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_search",
      description:
        "Search for a pattern in files recursively. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search pattern (regex)" },
          path: {
            type: "string",
            description: "Directory to search in (defaults to cwd)",
          },
          include: {
            type: "string",
            description: "File glob pattern, e.g. '*.ts' or '*.py'",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command and return its output. Use for builds, tests, git, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web using DuckDuckGo. Returns titles, URLs, and snippets. " +
        "Use this to find documentation, look up errors, research APIs, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          max_results: {
            type: "number",
            description: "Max results to return (default: 8)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch a URL and return its text content. HTML is converted to readable text. " +
        "Use this to read documentation pages, API references, articles, etc.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          max_length: {
            type: "number",
            description: "Max characters to return (default: 8000)",
          },
        },
        required: ["url"],
      },
    },
  },
];
