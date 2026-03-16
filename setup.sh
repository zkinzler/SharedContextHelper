#!/bin/bash
# BoodleBox Shared Context — Start the server.
# This generates the team config, commits it, and starts the server.
# Your teammates just need to: git pull && ./join.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BoodleBox Shared Context — Server Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get or generate a token
if [ -f "$SCRIPT_DIR/.boodlebox-token" ]; then
  SHARED_CONTEXT_TOKEN=$(cat "$SCRIPT_DIR/.boodlebox-token")
  echo "Using saved token"
else
  SHARED_CONTEXT_TOKEN=$(openssl rand -hex 16)
  echo "$SHARED_CONTEXT_TOKEN" > "$SCRIPT_DIR/.boodlebox-token"
  echo "Generated new token"
fi

# Detect IP
if command -v ipconfig &> /dev/null; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
elif command -v hostname &> /dev/null; then
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
else
  LOCAL_IP="localhost"
fi

PORT="${PORT:-3099}"
EXTERNAL_URL="http://${LOCAL_IP}:${PORT}"

# Write team-config.json
cat > "$SCRIPT_DIR/team-config.json" << EOF
{
  "url": "$EXTERNAL_URL",
  "token": "$SHARED_CONTEXT_TOKEN",
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "Wrote team-config.json ($EXTERNAL_URL)"

# Auto-commit team-config.json so teammates can git pull
if command -v git &> /dev/null && git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  cd "$SCRIPT_DIR"
  git add team-config.json 2>/dev/null || true
  if ! git diff --cached --quiet team-config.json 2>/dev/null; then
    git commit -m "Update team-config.json with server URL" --quiet 2>/dev/null || true
    git push --quiet 2>/dev/null || echo "(Could not push — teammates can pull after you push)"
  fi
fi

# Also run join.sh for yourself
NAME="${1:-}"
if [ -z "$NAME" ] && [ -f ~/.boodlebox-user ]; then
  NAME=$(cat ~/.boodlebox-user)
fi
if [ -z "$NAME" ]; then
  read -p "What's your first name? " NAME
fi
if [ -n "$NAME" ]; then
  echo ""
  echo "Setting up your own Claude Code..."
  bash "$SCRIPT_DIR/join.sh" "$NAME"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Server ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Tell your teammates:"
echo "    git clone https://github.com/zkinzler/SharedContextHelper.git"
echo "    cd SharedContextHelper"
echo "    ./join.sh"
echo ""
echo "  Starting server..."
echo ""

SHARED_CONTEXT_TOKEN="$SHARED_CONTEXT_TOKEN" \
EXTERNAL_URL="$EXTERNAL_URL" \
PORT="$PORT" \
exec npx tsx "$SCRIPT_DIR/src/index.ts"
