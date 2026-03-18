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

NOTIFICATIONS=""

# Delegated tasks — show first task detail
if echo "$TASKS" 2>/dev/null | grep -q '"status":"pending"'; then
  TASK_COUNT=$(echo "$TASKS" | grep -o '"status":"pending"' | wc -l | tr -d ' ')
  # Extract first pending task description and goal
  FIRST_DESC=$(echo "$TASKS" | grep -o '"description":"[^"]*"' | head -1 | sed 's/"description":"//;s/"//')
  FIRST_GOAL=$(echo "$TASKS" | grep -o '"goal":"[^"]*"' | head -1 | sed 's/"goal":"//;s/"//')
  if [ "$TASK_COUNT" -eq 1 ]; then
    NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] Delegated task: \"${FIRST_DESC}\" (plan: ${FIRST_GOAL}). "
  else
    NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] ${TASK_COUNT} delegated tasks. First: \"${FIRST_DESC}\" (plan: ${FIRST_GOAL}). "
  fi
fi

# In-progress tasks
if echo "$TASKS" 2>/dev/null | grep -q '"status":"in_progress"'; then
  IP_COUNT=$(echo "$TASKS" | grep -o '"status":"in_progress"' | wc -l | tr -d ' ')
  NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] ${IP_COUNT} task(s) in progress. "
fi

# Collab requests — show who
if echo "$REQUESTS" 2>/dev/null | grep -q '"status":"pending"'; then
  REQ_COUNT=$(echo "$REQUESTS" | grep -o '"status":"pending"' | wc -l | tr -d ' ')
  FROM=$(echo "$REQUESTS" | grep -o '"fromUserId":"[^"]*"' | head -1 | sed 's/"fromUserId":"//;s/"//')
  REPO=$(echo "$REQUESTS" | grep -o '"repoName":"[^"]*"' | head -1 | sed 's/"repoName":"//;s/"//')
  if [ "$REQ_COUNT" -eq 1 ]; then
    NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] ${FROM} wants to collaborate on ${REPO}. "
  else
    NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] ${REQ_COUNT} collab requests (first from ${FROM} on ${REPO}). "
  fi
fi

# Messages — show latest
if echo "$MESSAGES" 2>/dev/null | grep -q '"from":'; then
  MSG_COUNT=$(echo "$MESSAGES" | grep -o '"from":' | wc -l | tr -d ' ')
  LATEST_FROM=$(echo "$MESSAGES" | grep -o '"from":"[^"]*"' | tail -1 | sed 's/"from":"//;s/"//')
  LATEST_MSG=$(echo "$MESSAGES" | grep -o '"message":"[^"]*"' | tail -1 | sed 's/"message":"//;s/"//')
  # Truncate long messages
  LATEST_MSG=$(echo "$LATEST_MSG" | cut -c1-80)
  if [ "$MSG_COUNT" -eq 1 ]; then
    NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] ${LATEST_FROM}: ${LATEST_MSG}. "
  else
    NOTIFICATIONS="${NOTIFICATIONS}[BoodleBox] ${MSG_COUNT} messages. Latest from ${LATEST_FROM}: ${LATEST_MSG}. "
  fi
fi

# Only output if there are notifications
if [ -n "$NOTIFICATIONS" ]; then
  echo "${NOTIFICATIONS}Run /collaborate to see details."
fi

exit 0
