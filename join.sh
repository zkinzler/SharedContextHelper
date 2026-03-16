#!/bin/bash
# Join the BoodleBox shared context server.
# Just run: ./join.sh YourName
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/team-config.json"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: team-config.json not found."
  echo "Someone needs to start the server first with: ./setup.sh"
  exit 1
fi

SERVER_URL=$(cat "$CONFIG" | grep '"url"' | sed 's/.*"url": *"//;s/".*//')
TOKEN=$(cat "$CONFIG" | grep '"token"' | sed 's/.*"token": *"//;s/".*//')

if [ -z "$SERVER_URL" ] || [ -z "$TOKEN" ]; then
  echo "ERROR: Invalid team-config.json"
  exit 1
fi

# Check for Claude CLI
if ! command -v claude &> /dev/null; then
  echo ""
  echo "Claude Code CLI not found."
  echo "Install it first: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

# Get name
NAME="${1:-}"
if [ -z "$NAME" ]; then
  read -p "What's your first name? " NAME
fi

if [ -z "$NAME" ]; then
  echo "ERROR: Name is required."
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BoodleBox Shared Context — Joining"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test server connection
echo "Connecting to $SERVER_URL..."
if ! curl -sf "${SERVER_URL}/health" > /dev/null 2>&1; then
  echo ""
  echo "Can't reach the server at $SERVER_URL"
  echo "Make sure someone has started it with: ./setup.sh"
  exit 1
fi
echo "Server is up!"
echo ""

# Save identity
echo "$NAME" > ~/.boodlebox-user
echo "[1/3] Saved identity: $NAME"

# Add MCP server
claude mcp remove -s user shared-context 2>/dev/null || true
claude mcp add --transport http --scope user shared-context "$SERVER_URL/mcp" --header "Authorization: Bearer $TOKEN"
echo "[2/3] Connected to server"

# Install skill
mkdir -p ~/.claude/skills/collaborate
cp "$SCRIPT_DIR/.claude/skills/collaborate/SKILL.md" ~/.claude/skills/collaborate/SKILL.md
echo "[3/3] Installed /collaborate skill"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All done, $NAME!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Open Claude Code in any project and type:"
echo "    /collaborate"
echo ""
