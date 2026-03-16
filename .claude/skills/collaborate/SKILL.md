---
name: collaborate
description: >
  BoodleBox team collaboration. Coordinate with teammates across any project.
  Auto-detects your git repo and branch. See who's working on what, share projects,
  track deployments, delegate tasks, send collab requests. Invoke when user says
  collaborate, team, coordinate, who's working, share project, delegate, work with,
  what is [name] doing, or type /collaborate.
allowed-tools: Bash(git *), Bash(hostname), Bash(cat ~/.boodlebox-user), Bash(echo * > ~/.boodlebox-user), Bash(curl *), Bash(cat *), Bash(mkdir *), Bash(node -e *), Read
---

# BoodleBox Team Collaboration

This skill connects to a single shared server via REST API. Works from any
directory, any project — no per-repo config needed.

## CRITICAL RULES

- **NEVER start a local server.** Do not run setup.sh, npm run dev, npm run start, or tsx.
  The server is already running in the cloud. You only need to connect to it.
- **NEVER modify team-config.json.** It contains the shared cloud server URL. Do not change it.
- **NEVER run npm install** unless the user explicitly asks to develop the server code.
- The server URL is: `https://shared-context-helper-production.up.railway.app`
- The token is in `team-config.json` in the repo (field: `token`) or in `~/.boodlebox-config.json`

## On startup, do this automatically:

Run ALL of these steps in a SINGLE bash command block to be fast. Do not stop to
explain each step — just do it all and show the results at the end.

**Step 1: Get identity, config, and git context all at once.**

```bash
# Identity
USER=$(cat ~/.boodlebox-user 2>/dev/null)

# Config — check global config first, then team-config.json in repo
CONFIG=$(cat ~/.boodlebox-config.json 2>/dev/null)
if [ -z "$CONFIG" ]; then
  # Try team-config.json in current dir or git root
  TC=$(cat team-config.json 2>/dev/null || cat "$(git rev-parse --show-toplevel 2>/dev/null)/team-config.json" 2>/dev/null)
  if [ -n "$TC" ]; then
    SERVER_URL=$(echo "$TC" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
    TOKEN=$(echo "$TC" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
  fi
else
  SERVER_URL=$(echo "$CONFIG" | grep -o '"serverUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"serverUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
  TOKEN=$(echo "$CONFIG" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
fi

# Git context
REPO_URL=$(git remote get-url origin 2>/dev/null)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
REPO_NAME=$(basename -s .git "$REPO_URL" 2>/dev/null)
COMMIT_INFO=$(git log -1 --format="%H|||%s" 2>/dev/null)
LOCAL_PATH=$(pwd)
MACHINE=$(hostname)

echo "USER=$USER"
echo "SERVER_URL=$SERVER_URL"
echo "TOKEN=${TOKEN:0:4}..."
echo "REPO=$REPO_NAME BRANCH=$BRANCH"
```

**Step 2: Handle missing identity.**
If USER is empty, ask for their first name. Then save it:
```bash
echo "TheirName" > ~/.boodlebox-user
```

**Step 3: Handle missing config.**
If SERVER_URL is empty (no config file AND no team-config.json found):
- Ask: "What's the server URL for your team's collaboration server?"
- If they don't know, tell them: "Ask a teammate who set this up, or check if there's
  a SharedContextHelper repo with a team-config.json in it."

Once you have SERVER_URL and TOKEN, **always save to global config** so it works next time:
```bash
cat > ~/.boodlebox-config.json << EOF
{
  "serverUrl": "$SERVER_URL",
  "token": "$TOKEN",
  "userId": "$USER"
}
EOF
```

**Step 4: Connect, register, and fetch everything in one block.**

```bash
SERVER_URL="..." TOKEN="..." USER="..."

# Test connection
HEALTH=$(curl -sf "$SERVER_URL/health" 2>/dev/null)
if [ -z "$HEALTH" ]; then echo "SERVER_UNREACHABLE"; exit 1; fi

# Register
curl -s -X POST "$SERVER_URL/api/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"userId\":\"$USER\",\"machineId\":\"$(hostname)\"}"

# Share git context (if in a repo)
if [ -n "$REPO_URL" ]; then
  HASH=$(echo "$COMMIT_INFO" | cut -d'|||' -f1)
  MSG=$(echo "$COMMIT_INFO" | cut -d'|||' -f2-)
  curl -s -X POST "$SERVER_URL/api/git-context" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"userId\":\"$USER\",\"repoUrl\":\"$REPO_URL\",\"repoName\":\"$REPO_NAME\",\"branch\":\"$BRANCH\",\"localPath\":\"$LOCAL_PATH\",\"lastCommitHash\":\"$HASH\",\"lastCommitMessage\":\"$MSG\"}"
fi

echo "---OVERVIEW---"
curl -s "$SERVER_URL/api/overview?userId=$USER" -H "Authorization: Bearer $TOKEN"
echo "---MESSAGES---"
curl -s "$SERVER_URL/api/messages?userId=$USER" -H "Authorization: Bearer $TOKEN"
echo "---TASKS---"
curl -s "$SERVER_URL/api/delegation/my-tasks/$USER" -H "Authorization: Bearer $TOKEN"
echo "---REQUESTS---"
curl -s "$SERVER_URL/api/collab-requests/$USER" -H "Authorization: Bearer $TOKEN"
```

**Step 5: Report dashboard.** Show a friendly summary:
- **Your context:** repo, branch (if in a git repo)
- **Team:** who's online, what repo/branch they're on, what they're working on
- **Collab requests:** "Alex wants to collaborate with you on [repo] @ [branch]" — ask if they want to accept
- **Delegated tasks:** pending tasks assigned to you
- **Messages:** any broadcasts
- **Shared projects:** available to clone
- **Tip:** "Say 'I want to work with [name]' to send them a collab request"

## Interactive flows

### "I want to collaborate" (generic)
Show the full team dashboard. Let the user pick someone to work with or a project to join.

### "I want to collaborate on [GitHub URL]"
1. If the repo is already cloned locally, detect it. Otherwise offer to clone.
2. Register git context for that repo.
3. Show who else is working on that repo.
4. Offer to share the project so others can discover it.

### "I want to work with [person]" or "collaborate with [person]"
1. GET `/api/team` to find that person and their current repo/branch.
2. Show what they're working on.
3. Ask the user: "Want to send Alex a collab request for [repo] @ [branch]?"
4. If yes, POST `/api/collab-request`:
   ```json
   {
     "fromUserId": "Zach",
     "toUserId": "Alex",
     "repoUrl": "https://github.com/...",
     "repoName": "app",
     "branch": "feature/auth",
     "message": "Let's pair on the auth flow"
   }
   ```
5. Confirm: "Request sent! Alex will see it next time they /collaborate."

### Incoming collab requests
When the dashboard shows pending requests:
1. Highlight each one: "Alex wants to collaborate with you on boodlebox/app @ feature/auth"
2. Ask if they want to accept.
3. If accepted, POST `/api/collab-request/ID/respond` with `"accepted"`.
4. Then offer: "Want me to clone the repo? `git clone [url] && git checkout [branch]`"

## GitHub URL sharing

When a user says "share this project" or "let others join":
1. Get repo URL and branch from git
2. Ask for a short description
3. POST `/api/share-project` with userId, repoUrl, branch, description
4. "Shared! Teammates will see it when they /collaborate."

## Deployments

After a `vercel deploy` or similar:
- Parse output for URLs
- POST `/api/deployment` with platform, project name, URL, status

## Ongoing behavior

- **Before editing a shared file:** GET `/api/file-activity?filePath=...`
- **When starting a new task:** POST `/api/status` with your goal
- **When making a big change:** POST `/api/broadcast`
- **After git push:** POST `/api/git-context`
- **After deploy:** POST `/api/deployment`

## Task Delegation

When a user describes a big goal:
1. GET `/api/team` to see who's available
2. Break down into subtasks, consider dependencies and who's best suited
3. **For each subtask, write a rich context brief** — this is CRITICAL. The receiving
   Claude has never seen this codebase or conversation. You must include:
   - `context`: Why this task exists, how it fits into the bigger picture, what
     decisions led here, what the current state of the code is. Write as if briefing
     a new team member who knows nothing about the project.
   - `filesToExamine`: Specific file paths the other Claude should read first
   - `approach`: How to implement it — reference existing patterns, function names,
     architectural decisions, things to avoid. Be specific and technical.
4. Present plan to user for approval
5. POST `/api/delegation/create` with the breakdown including context fields:
   ```json
   {"userId":"NAME","goal":"...","subtasks":[
     {
       "description":"Short summary of the task",
       "assignedTo":"Mike",
       "priority":"high",
       "context":"We are building a collaboration system for Claude Code instances. The server is a Node.js Express app deployed on Railway. We just added a notification hook (hooks/check-notifications.sh) that checks the server every 60 seconds via a UserPromptSubmit hook in Claude Code. The current limitation is that notifications are text-only — the user might miss them. We need a visual or audio alert...",
       "filesToExamine":["hooks/check-notifications.sh","join.sh","~/.claude/settings.json"],
       "approach":"Look at how the hook currently outputs text to stdout. Add a macOS notification via osascript or a terminal bell. Keep it cross-platform — check the OS first. Follow the existing pattern in the hook of being lightweight with a 2-second timeout."
     }
   ]}
   ```
6. POST `/api/broadcast` to notify the team

### Auto-work: Claude-to-Claude delegation

When the dashboard shows delegated tasks assigned to you, **proactively offer to start working**:

1. **Show each pending task with the context the delegating Claude provided:**
   "You have a task from [coordinator]: [description] [priority]"
   If the task has `context`, summarize it for the user in plain language:
   "Here's what Zach's Claude says about this: [context summary]"
   If it has `filesToExamine`, mention: "I should look at [files] first."
   If it has `approach`, mention: "The suggested approach is: [approach summary]"
   Then ask: "Want me to start working on this?"

2. **When the user says yes (or you auto-start):**
   - POST `/api/delegation/PLANID/respond` with `"accepted"`
   - POST `/api/delegation/PLANID/update` with `"in_progress"`
   - **Read the files listed in `filesToExamine`** to understand the codebase
   - **Follow the `approach`** guidance from the delegating Claude
   - **Use `context`** to understand why this task matters and what decisions were made
   - Log start: POST `/api/delegation/PLANID/log` with `{"subtaskId":"...","userId":"...","type":"progress","message":"Starting work on: [description]"}`

3. **While working, log progress after meaningful milestones:**
   - After creating/editing a file: POST log with `type: "file_change"` and `metadata: {"filePath": "..."}`
   - After a git commit: POST log with `type: "commit"` and `metadata: {"commitHash": "...", "commitMessage": "..."}`
   - If blocked by a dependency or issue: POST log with `type: "blocker"` and the description
   - General progress updates: POST log with `type: "progress"`

   Example:
   ```bash
   curl -s -X POST "$SERVER_URL/api/delegation/PLANID/log" \
     -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
     -d '{"subtaskId":"...","userId":"...","type":"commit","message":"Added REST endpoints for work logging","metadata":{"commitHash":"abc123"}}'
   ```

4. **When done:**
   - POST `/api/delegation/PLANID/log` with `type: "complete"` and a summary
   - POST `/api/delegation/PLANID/update` with `"completed"` and summary notes
   - Notify: POST `/api/broadcast` with "[user] completed: [subtask description]"

5. **Check dependencies before starting:**
   If a subtask has dependencies, GET `/api/delegation/PLANID` to check if they're completed.
   If blocked, tell the user and log a blocker. Check again when prompted or on next `/collaborate`.

### Monitoring delegated work

The coordinator (person who created the plan) can check progress:
- GET `/api/delegation/PLANID` shows all subtasks with their work logs
- Each work log entry has a timestamp, type, and message
- This lets you see in real-time what each Claude is doing on their subtask

When viewing a plan as coordinator, summarize the work logs:
- "Alex's Claude: started 5 min ago, 2 commits, currently working on file X"
- "Mike's Claude: blocked on subtask A, waiting for Alex to finish"

## Quick commands

- `/collaborate` — full check-in (dashboard + requests + tasks)
- `/collaborate status` — team overview only
- `/collaborate broadcast <msg>` — send a broadcast
- `/collaborate tasks` — list shared tasks
- `/collaborate share` — share current project
- `/collaborate delegate <goal>` — break down and delegate a goal
- `/collaborate my-tasks` — delegated tasks assigned to you
- `/collaborate plan <planId>` — view delegation plan status
- `/collaborate work with <person>` — send a collab request

## REST API Reference

All endpoints require `Authorization: Bearer TOKEN` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/register | Register/heartbeat `{userId, machineId?}` |
| POST | /api/status | Update status `{userId, currentGoal?, workingFiles?, status?}` |
| GET | /api/team?userId= | Get team members |
| POST | /api/git-context | Update git info |
| GET | /api/overview?userId= | Full dashboard |
| POST | /api/broadcast | Send message `{userId, message, ttlMinutes?}` |
| GET | /api/messages?userId=&since= | Get messages |
| POST | /api/tasks/create | Create task `{userId, description}` |
| GET | /api/tasks?filter= | List tasks |
| POST | /api/tasks/:id/claim | Claim task `{userId}` |
| POST | /api/tasks/:id/release | Release task `{userId}` |
| POST | /api/delegation/create | Create plan `{userId, goal, subtasks[]}` |
| GET | /api/delegation?filter= | List plans |
| GET | /api/delegation/:planId | Get plan details |
| GET | /api/delegation/my-tasks/:userId | Get assigned subtasks |
| POST | /api/delegation/:planId/respond | Accept/reject subtask |
| POST | /api/delegation/:planId/update | Update subtask status |
| POST | /api/delegation/:planId/log | Append work log `{subtaskId, userId, type, message, metadata?}` |
| POST | /api/share-project | Share project |
| POST | /api/deployment | Update deployment |
| GET | /api/file-activity?filePath=&userId= | File activity |
| POST | /api/collab-request | Send collab request `{fromUserId, toUserId, repoUrl, repoName, branch, message?}` |
| GET | /api/collab-requests/:userId | Get pending requests |
| POST | /api/collab-request/:id/respond | Accept/decline `{userId, response}` |
