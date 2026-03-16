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

## On startup, do this automatically:

1. **Get user identity.** Run `cat ~/.boodlebox-user 2>/dev/null`.
   If not found, ask for their first name and save: `echo "NAME" > ~/.boodlebox-user`

2. **Get server connection.** Run `cat ~/.boodlebox-config.json 2>/dev/null`.
   This file has `serverUrl`, `token`, and `userId`.

   If not found, look for `team-config.json` in the current directory or git root:
   ```bash
   cat team-config.json 2>/dev/null || cat "$(git rev-parse --show-toplevel 2>/dev/null)/team-config.json" 2>/dev/null
   ```
   If found, read `url` and `token` from it and create `~/.boodlebox-config.json`:
   ```bash
   node -e "
   const tc = JSON.parse(require('fs').readFileSync('team-config.json','utf8'));
   const config = {serverUrl: tc.url, token: tc.token, userId: '$(cat ~/.boodlebox-user)'};
   require('fs').writeFileSync(process.env.HOME+'/.boodlebox-config.json', JSON.stringify(config,null,2));
   "
   ```

   If neither found, tell the user:
   "I need a server to connect to. Options:
   - If a teammate already set this up, ask them for the server URL and token
   - Run `./join.sh` in the SharedContextHelper repo"
   Then ask for serverUrl and token, and save to `~/.boodlebox-config.json`.

   Once you have the config, set variables for all subsequent calls:
   ```bash
   SERVER_URL=... TOKEN=... USER=...
   ```

3. **Test connection.**
   ```bash
   curl -sf "$SERVER_URL/health"
   ```
   If it fails, tell the user the server is unreachable.

4. **Register.**
   ```bash
   curl -s -X POST "$SERVER_URL/api/register" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d "{\"userId\":\"$USER\",\"machineId\":\"$(hostname)\"}"
   ```

5. **Share git context** (if in a git repo):
   ```bash
   REPO_URL=$(git remote get-url origin 2>/dev/null)
   BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
   REPO_NAME=$(basename -s .git "$REPO_URL" 2>/dev/null)
   COMMIT_INFO=$(git log -1 --format="%H|||%s" 2>/dev/null)
   LOCAL_PATH=$(pwd)
   ```
   If git info detected, POST to `/api/git-context`.

6. **Get the full picture.** Make these calls (can be combined in one bash block):
   - `GET /api/overview?userId=$USER` → team members, shared projects, deployments
   - `GET /api/messages?userId=$USER` → broadcast messages
   - `GET /api/delegation/my-tasks/$USER` → delegated tasks
   - `GET /api/collab-requests/$USER` → incoming collaboration requests

7. **Report dashboard.** Show a friendly summary:
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
3. Present plan to user for approval
4. POST `/api/delegation/create` with the breakdown
5. POST `/api/broadcast` to notify the team

When you see delegated tasks:
- **Pending:** Ask user to accept → POST `/api/delegation/PLANID/respond`
- **Accepted:** Starting work → POST `/api/delegation/PLANID/update` with `"in_progress"`
- **Done:** POST update with `"completed"` and notes

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
| POST | /api/share-project | Share project |
| POST | /api/deployment | Update deployment |
| GET | /api/file-activity?filePath=&userId= | File activity |
| POST | /api/collab-request | Send collab request `{fromUserId, toUserId, repoUrl, repoName, branch, message?}` |
| GET | /api/collab-requests/:userId | Get pending requests |
| POST | /api/collab-request/:id/respond | Accept/decline `{userId, response}` |
