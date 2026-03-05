# merc

Mercury — an ultra-fast AI coding agent CLI powered by Inception Labs' diffusion LLM. Built with [Ink](https://github.com/vadimdemedes/ink) (React for terminal).

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
