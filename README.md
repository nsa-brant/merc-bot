# merc

Mercury — an ultra-fast AI coding agent CLI and code assistant powered by Inception Labs' diffusion LLM. Built with [Ink](https://github.com/vadimdemedes/ink) (React for terminal).

## What It Does

Merc is an agentic coding assistant that runs in your terminal. It can read, write, and edit files in your project, search code, run shell commands, and hold multi-turn conversations — all with user approval before any changes are applied.

### Tools

- **Read files** — view any file in your project
- **Edit files** — surgical find-and-replace with diff preview and y/n confirmation
- **Write files** — create new files or full overwrites, with diff preview
- **Delete files** — remove files or empty directories, with confirmation
- **Rename/move files** — rename or relocate files and directories
- **List directories** — browse project structure
- **Grep search** — regex search across files with glob filtering
- **Run commands** — execute shell commands (builds, tests, git, etc.) with a 30s timeout

### Features

- Streaming responses with live markdown rendering
- Agentic loop — Mercury can chain multiple tool calls to complete complex tasks
- Session save/load — persist and resume conversations
- Command history with arrow-key navigation
- One-shot mode for quick questions (`merc "what does this function do"`)
- Interactive mode for extended coding sessions
- Colored diffs with y/n approval before any file modification
- Configurable model selection
- API retry with exponential backoff

## Install

```bash
git clone git@github.com:nsa-brant/merc-bot.git
cd merc-bot
bun install
bun build --compile index.tsx --outfile merc
```

Then symlink it globally:

```bash
ln -sf "$(pwd)/merc" ~/.bun/bin/merc
```

Now `merc` is available from anywhere.

## Usage

Interactive mode:

```bash
merc
```

One-shot mode:

```bash
merc "explain this codebase"
```

## Slash Commands

| Command | Description |
|---|---|
| `/clear` | Reset conversation |
| `/model [name]` | Show or switch model |
| `/save [name]` | Save conversation |
| `/load <name>` | Load saved conversation |
| `/sessions` | List saved sessions |
| `/history` | Show conversation history |
| `/key [key]` | Show or update API key |
| `/version` | Show version info |
| `/help` | Show all commands |
| `/quit` | Exit |

## Configuration

On first run, merc will prompt for your Inception Labs API key. It's stored at `~/.config/merc/config.json`.

You can also set it via environment variable:

```bash
export INCEPTION_API_KEY=your-key-here
```

## Rebuild

After making changes:

```bash
bun build --compile index.tsx --outfile merc
```
