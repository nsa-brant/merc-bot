# Recommendations for Merc‑Bot

Below is a concise, prioritized list of features and improvements you can add to the **merc‑bot** codebase. The ideas are grouped by category and include short implementation notes.

---

## 1️⃣ Usability / UX Improvements
| # | Feature | Why it matters | Rough implementation tip |
|---|---------|----------------|--------------------------|
| 1 | **Command history & arrow‑key navigation** | Makes the interactive REPL feel like a normal shell. | Enable `readline` history (`rl.history = []`, set `rl.historySize`). |
| 2 | **Auto‑completion for slash‑commands** | Reduces typing errors (`/clear`, `/model`, …). | Provide a `completer` callback to `readline.createInterface` that returns the list of known commands. |
| 3 | **Configurable output style** (plain vs. colored markdown) | Some terminals (e.g., CI logs) don’t handle ANSI‑rich markdown rendering well. | Add a `--no‑color` flag or a `color` field in `config.json`; conditionally wrap `chalk` calls. |
| 4 | **Conversation export / import** | Lets users save a session and resume later, or share a transcript. | Implement `/save <file>` and `/load <file>` commands that `JSON.stringify(state.messages)` to a file. |
| 5 | **Dry‑run mode for file edits** | Prevents accidental overwrites when the model suggests a change you haven’t inspected yet. | Add a `--dry-run` flag that skips `fs.writeFileSync` and only prints the diff. |
| 6 | **Prompt templates** | Users can switch between “coding”, “debugging”, “shell‑assistant”, etc., without editing the system prompt manually. | Store named templates in `~/.config/merc/templates/*.txt` and expose a `/template <name>` command. |

---

## 2️⃣ Robustness / Error Handling
| # | Feature | Why it matters | Rough implementation tip |
|---|---------|----------------|--------------------------|
| 7 | **Retry wrapper for API calls** | Transient network glitches or rate‑limit responses cause the whole session to abort. | Wrap `state.client.chat.completions.create` in a retry loop with exponential back‑off (e.g., 3 attempts). |
| 8 | **Better validation of tool arguments** | `edit_file` will throw if `old_string` is missing; malformed JSON from the model can crash the loop. | Use a tiny schema validator (e.g., `ajv` or `zod`) before calling `executeTool`. |
| 9 | **Graceful shutdown on SIGINT** | Currently `Ctrl‑C` just exits; any pending diff confirmation may be left hanging. | Register `process.on('SIGINT', …)` to close the active readline and clean up. |
|10 | **Timeout for long‑running commands** | `run_command` can block indefinitely if a user‑provided command hangs. | Use `execSync(..., { timeout: 15000 })` and catch the error to report “command timed out”. |
|11 | **File‑size guard for `write_file`** | Prevents accidental creation of huge files (e.g., a model hallucination). | If `args.content.length > 5_000_000` (5 MiB) ask for explicit confirmation. |

---

## 3️⃣ Extensibility / New Tooling
| # | Feature | Why it matters | Rough implementation tip |
|---|---------|----------------|--------------------------|
|12 | **File deletion / rename / move** | Many workflows need to clean up generated artifacts. | Add `delete_file`, `rename_file`, `move_file` tools (wrappers around `fs.unlinkSync`, `fs.renameSync`). |
|13 | **Search & replace across multiple files** | A single `edit_file` call can’t span many files. | Extend `edit_file` with a `glob` argument, or add a `bulk_edit` tool that runs `grep_search` + `replace_all`. |
|14 | **Shell‑script execution with output streaming** | Users often want to run a build or test suite and see live output. | Replace `execSync` with `spawn` and pipe `stdout`/`stderr` to the console while the model can read the final result. |
|15 | **Custom tool registration** | Power users may want to plug in their own scripts (e.g., Docker, Git). | Load all `*.js` files from a `plugins/` folder; each exports `{ name, description, parameters, fn }` and merge into `tools`. |
|16 | **Temperature / top_p control** | Different tasks benefit from more deterministic or more creative outputs. | Add `/set temperature <float>` and `/set top_p <float>` commands that update `state.client` options (`temperature`, `top_p`). |
|17 | **Model‑selection UI** | The current `model` flag is a free‑form string; a typo silently fails. | Provide `/list-models` (hard‑coded list) and `/model <name>` with validation. |

---

## 4️⃣ Maintenance / Testability
| # | Feature | Why it matters | Rough implementation tip |
|---|---------|----------------|--------------------------|
|18 | **Unit tests for all tool wrappers** | Guarantees that `edit_file`, `write_file`, etc., keep working after refactors. | Use `bun test` (or `jest`); mock `fs` and `execSync`. |
|19 | **CI pipeline (GitHub Actions)** | Automates linting, type‑checking, and test runs on every PR. | Add `.github/workflows/ci.yml` that runs `bun install && bun test && bun lint`. |
|20 | **ESLint / Prettier configuration** | Enforces consistent style across the repo. | Add `eslint` and `prettier` dev dependencies and a `lint` script in `package.json`. |
|21 | **Typed configuration file** | `config.json` is just a loose object; a malformed file can cause crashes. | Define a `type Config = { api_key: string; model?: string; color?: boolean; }` and validate on load with `zod`. |
|22 | **Version command** | Users may want to know which release they are running. | Add a `VERSION` constant (read from `package.json`) and a `/version` command. |

---

## 5️⃣ Documentation & Onboarding
| # | Feature | Why it matters | Rough implementation tip |
|---|---------|----------------|--------------------------|
|23 | **Expanded README** | New users need a quick “how‑to‑run‑a‑one‑shot‑with‑a‑prompt” example. | Add sections: “Installation”, “First‑time setup”, “Common commands”, “Extending with plugins”. |
|24 | **In‑CLI help pages** | `/help` currently prints a short list; a richer help could show usage for each command. | Store a `help.txt` (or JSON) and render it with markdown when `/help` is invoked. |
|25 | **Example plugins** | Demonstrates how to add custom tools. | Provide `plugins/example_git.js` that wraps `git status` and returns the output. |

---

## Prioritisation Suggestions
1. **Quick wins (≤ 2 h)** – `/version`, `/save`/`/load`, richer `/help`, command history, and a timeout on `run_command`.
2. **Safety & robustness (≤ 1 day)** – retry logic for API calls, argument validation, graceful SIGINT handling.
3. **Extensibility (≤ 2 days)** – plugin loader skeleton, file‑delete/rename tools, temperature/top_p controls.
4. **Testing & CI (≤ 3 days)** – unit tests for each tool, GitHub Actions workflow, ESLint/Prettier.
5. **Polish & docs (≤ 1 day)** – expanded README, dry‑run flag, example plugin.

Feel free to pick any subset of these items, and I can help you scaffold the code, write tests, or set up the CI workflow.
