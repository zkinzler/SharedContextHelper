#!/bin/bash
# BoodleBox notification check — runs on every user prompt.
# Checks for new delegated tasks, collab requests, and messages.
# Output goes to Claude's context so it's aware of incoming work.

CONFIG="$HOME/.boodlebox-config.json"
[ ! -f "$CONFIG" ] && exit 0

SERVER_URL=$(grep -o '"serverUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" | head -1 | sed 's/.*"serverUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
TOKEN=$(grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" | head -1 | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
USER=$(grep -o '"userId"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" | head -1 | sed 's/.*"userId"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')

[ -z "$SERVER_URL" ] || [ -z "$TOKEN" ] || [ -z "$USER" ] && exit 0

AUTH="Authorization: Bearer $TOKEN"

# Rate limit — only check every 60 seconds
LAST_CHECK_FILE="/tmp/.boodlebox-last-check"
if [ -f "$LAST_CHECK_FILE" ]; then
  LAST=$(cat "$LAST_CHECK_FILE")
  NOW=$(date +%s)
  DIFF=$((NOW - LAST))
  [ "$DIFF" -lt 60 ] && exit 0
fi
date +%s > "$LAST_CHECK_FILE"

# Fetch notifications (2 second timeout to not slow things down)
TASKS=$(curl -sf --connect-timeout 2 --max-time 2 "$SERVER_URL/api/delegation/my-tasks/$USER" -H "$AUTH" 2>/dev/null)
REQUESTS=$(curl -sf --connect-timeout 2 --max-time 2 "$SERVER_URL/api/collab-requests/$USER" -H "$AUTH" 2>/dev/null)
MESSAGES=$(curl -sf --connect-timeout 2 --max-time 2 "$SERVER_URL/api/messages?userId=$USER" -H "$AUTH" 2>/dev/null)

# Build notification output — only if there's something new
NOTIFICATIONS=""

# Check for pending delegated tasks
TASK_COUNT=$(echo "$TASKS" 2>/dev/null | grep -o '"status":"pending"' | wc -l | tr -d ' ')
if [ "$TASK_COUNT" -gt 0 ]; then
  NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] You have $TASK_COUNT pending delegated task(s). "
fi

# Check for in-progress tasks
IP_COUNT=$(echo "$TASKS" 2>/dev/null | grep -o '"status":"in_progress"' | wc -l | tr -d ' ')
if [ "$IP_COUNT" -gt 0 ]; then
  NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] You have $IP_COUNT task(s) in progress. "
fi

# Check for collab requests
REQ_COUNT=$(echo "$REQUESTS" 2>/dev/null | grep -o '"status":"pending"' | wc -l | tr -d ' ')
if [ "$REQ_COUNT" -gt 0 ]; then
  NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] You have $REQ_COUNT collaboration request(s). "
fi

# Check for messages
MSG_COUNT=$(echo "$MESSAGES" 2>/dev/null | grep -o '"from":' | wc -l | tr -d ' ')
if [ "$MSG_COUNT" -gt 0 ]; then
  NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] $MSG_COUNT team message(s). "
fi

# Only output if there are notifications
if [ -n "$NOTIFICATIONS" ]; then
  echo "${NOTIFICATIONS}Run /collaborate to see details."
fi

exit 0
