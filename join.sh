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
echo "[1/4] Saved identity: $NAME"

# Save global config (~/.boodlebox-config.json)
cat > ~/.boodlebox-config.json << JSONEOF
{
  "serverUrl": "$SERVER_URL",
  "token": "$TOKEN",
  "userId": "$NAME"
}
JSONEOF
echo "[2/4] Saved config to ~/.boodlebox-config.json"

# Install skill
mkdir -p ~/.claude/skills/collaborate
cp "$SCRIPT_DIR/.claude/skills/collaborate/SKILL.md" ~/.claude/skills/collaborate/SKILL.md
echo "[3/4] Installed /collaborate skill"

# Install notification hook
mkdir -p ~/.claude/hooks
cp "$SCRIPT_DIR/hooks/check-notifications.sh" ~/.claude/hooks/boodlebox-check.sh
chmod +x ~/.claude/hooks/boodlebox-check.sh

# Add hook to settings.json if not already there
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
  if ! grep -q "boodlebox-check" "$SETTINGS" 2>/dev/null; then
    # Merge hook into existing settings
    node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('$SETTINGS','utf8'));
    s.hooks = s.hooks || {};
    s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || [];
    const exists = s.hooks.UserPromptSubmit.some(h => JSON.stringify(h).includes('boodlebox'));
    if (!exists) {
      s.hooks.UserPromptSubmit.push({
        matcher: '',
        hooks: [{ type: 'command', command: 'bash ~/.claude/hooks/boodlebox-check.sh' }]
      });
    }
    fs.writeFileSync('$SETTINGS', JSON.stringify(s, null, 2));
    " 2>/dev/null
  fi
else
  cat > "$SETTINGS" << HOOKEOF
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/boodlebox-check.sh"
          }
        ]
      }
    ]
  }
}
HOOKEOF
fi
echo "[4/4] Installed notification hook (checks for tasks on every message)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All done, $NAME!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Open Claude Code in ANY project and type:"
echo "    /collaborate"
echo ""
echo "  You'll also get automatic notifications when"
echo "  teammates assign tasks or send messages."
echo ""
