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

# Save to project registry (~/.boodlebox-projects.json)
REPO_URL=$(cd "$SCRIPT_DIR" && git remote get-url origin 2>/dev/null || echo "")
REPO_NAME=$(basename -s .git "$REPO_URL" 2>/dev/null || basename "$SCRIPT_DIR")
PROJECTS_FILE="$HOME/.boodlebox-projects.json"
TODAY=$(date +%Y-%m-%d)

if [ -f "$PROJECTS_FILE" ]; then
  # Use a temp file to update
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$PROJECTS_FILE', 'utf8'));
    data.projects = data.projects || {};
    data.projects['$REPO_NAME'] = {
      repoUrl: '$REPO_URL',
      serverUrl: '$SERVER_URL',
      token: '$TOKEN',
      addedAt: '$TODAY'
    };
    fs.writeFileSync('$PROJECTS_FILE', JSON.stringify(data, null, 2));
  " 2>/dev/null || echo '{"projects":{"'"$REPO_NAME"'":{"repoUrl":"'"$REPO_URL"'","serverUrl":"'"$SERVER_URL"'","token":"'"$TOKEN"'","addedAt":"'"$TODAY"'"}}}' > "$PROJECTS_FILE"
else
  echo '{"projects":{"'"$REPO_NAME"'":{"repoUrl":"'"$REPO_URL"'","serverUrl":"'"$SERVER_URL"'","token":"'"$TOKEN"'","addedAt":"'"$TODAY"'"}}}' > "$PROJECTS_FILE"
fi
echo "[2/4] Saved project to ~/.boodlebox-projects.json"

# Add MCP server (optional — the skill works via REST API without this)
if command -v claude &> /dev/null; then
  claude mcp remove -s user shared-context 2>/dev/null || true
  claude mcp add --transport http --scope user shared-context "$SERVER_URL/mcp" --header "Authorization: Bearer $TOKEN" 2>/dev/null || true
  echo "[3/4] Added MCP server (optional, for direct tool access)"
else
  echo "[3/4] Skipped MCP setup (Claude CLI not found — not required)"
fi

# Install skill
mkdir -p ~/.claude/skills/collaborate
cp "$SCRIPT_DIR/.claude/skills/collaborate/SKILL.md" ~/.claude/skills/collaborate/SKILL.md
echo "[4/4] Installed /collaborate skill"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All done, $NAME!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Open Claude Code in any project and type:"
echo "    /collaborate"
echo ""
echo "  No restart needed — it connects automatically via the REST API."
echo ""
