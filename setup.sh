#!/bin/bash
# BoodleBox Shared Context — Server Launcher
# This starts the server and shows you the invite link for your team.

set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BoodleBox Shared Context — Start Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get or generate a token
if [ -z "$SHARED_CONTEXT_TOKEN" ]; then
  if [ -f .boodlebox-token ]; then
    SHARED_CONTEXT_TOKEN=$(cat .boodlebox-token)
    echo "Using saved token from .boodlebox-token"
  else
    SHARED_CONTEXT_TOKEN=$(openssl rand -hex 16)
    echo "$SHARED_CONTEXT_TOKEN" > .boodlebox-token
    echo "Generated new token (saved to .boodlebox-token)"
  fi
fi

# Detect IP address for the invite link
if command -v ipconfig &> /dev/null; then
  # macOS
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "YOUR_IP")
elif command -v hostname &> /dev/null; then
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_IP")
else
  LOCAL_IP="YOUR_IP"
fi

PORT="${PORT:-3099}"
EXTERNAL_URL="${EXTERNAL_URL:-http://${LOCAL_IP}:${PORT}}"

echo ""
echo "Your team invite command (send this to everyone):"
echo ""
echo "  curl -sL ${EXTERNAL_URL}/install | bash -s -- TheirName"
echo ""
echo "Starting server..."
echo ""

SHARED_CONTEXT_TOKEN="$SHARED_CONTEXT_TOKEN" \
EXTERNAL_URL="$EXTERNAL_URL" \
PORT="$PORT" \
npx tsx src/index.ts
