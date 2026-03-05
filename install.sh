#!/usr/bin/env bash
set -e

# merc installer — requires bun (https://bun.sh)

if ! command -v bun &>/dev/null; then
  echo "Error: bun is required. Install it: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing dependencies..."
bun install

echo "Compiling binary..."
bun build --compile index.tsx --outfile merc

# Find a bin directory on PATH
BIN_DIR=""
if [ -d "$HOME/.bun/bin" ]; then
  BIN_DIR="$HOME/.bun/bin"
elif [ -d "$HOME/.local/bin" ]; then
  BIN_DIR="$HOME/.local/bin"
elif [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
fi

if [ -n "$BIN_DIR" ]; then
  ln -sf "$SCRIPT_DIR/merc" "$BIN_DIR/merc"
  echo "Linked merc → $BIN_DIR/merc"
else
  echo "Binary compiled to: $SCRIPT_DIR/merc"
  echo "Add it to your PATH or run: ln -sf $SCRIPT_DIR/merc /usr/local/bin/merc"
fi

echo ""
echo "Done! Run 'merc' to get started."
