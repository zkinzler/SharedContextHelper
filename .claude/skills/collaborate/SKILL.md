---
name: collaborate
description: >
  BoodleBox team collaboration. Coordinate with teammates across any project.
  Auto-detects your git repo and branch. See who's working on what, share projects,
  track deployments, delegate tasks. Invoke when user says collaborate, team,
  coordinate, who's working, share project, check deployments, delegate, what is
  [name] doing, or type /collaborate.
allowed-tools: Bash(git *), Bash(hostname), Bash(cat ~/.boodlebox-user), Bash(echo * > ~/.boodlebox-user), Bash(curl *), Bash(cat *team-config.json*), Bash(cat ~/.boodlebox-projects.json), Bash(mkdir *), Read
---

# BoodleBox Team Collaboration

This skill uses the REST API (`/api/*`) via curl — no MCP server setup or session
restart needed. All server calls go through a helper function.

## API helper

All calls use this pattern (adapt URL, token, method, and path as needed):

```bash
curl -s -X METHOD "$SERVER_URL/api/PATH" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"key":"value"}'
```

For GET requests, omit `-X` and `-d`, use query params instead.

## On startup, do this automatically:

1. **Get user identity.** Run `cat ~/.boodlebox-user 2>/dev/null` to get the user's name.
   If the file doesn't exist, ask for their first name and save it:
   `echo "TheirName" > ~/.boodlebox-user`

2. **Find the project server.** Look for connection info in this order:
   a. Check current git repo for `team-config.json` (has `url` and `token`)
   b. Check `~/.boodlebox-projects.json` for a saved project matching the current repo
   c. If neither found, ask the user: "Which project do you want to collaborate on?"
      - If they give a GitHub URL, clone it and look for `team-config.json`
      - If they give a project name, check `~/.boodlebox-projects.json`
      - If no match, tell them they need a team-config.json from whoever set up the server

   Once you have the URL and token, save them:
   ```bash
   # Read team-config.json
   SERVER_URL=$(cat team-config.json | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
   TOKEN=$(cat team-config.json | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
   ```

   Save to local project registry for future use:
   ```bash
   # Save project to ~/.boodlebox-projects.json for next time
   # (read existing, add/update entry, write back)
   ```

3. **Detect git context.** Run these commands (skip any that fail):
   - `git remote get-url origin 2>/dev/null` -> repoUrl
   - `git rev-parse --abbrev-ref HEAD 2>/dev/null` -> branch
   - `basename -s .git $(git remote get-url origin 2>/dev/null) 2>/dev/null` -> repoName
   - `git log -1 --format="%H|||%s" 2>/dev/null` -> last commit hash and message
   - `pwd` -> localPath
   - `hostname` -> machineId

4. **Register with team.**
   ```bash
   curl -s -X POST "$SERVER_URL/api/register" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"userId":"NAME","machineId":"HOSTNAME"}'
   ```

5. **Share git context.** If git info was detected:
   ```bash
   curl -s -X POST "$SERVER_URL/api/git-context" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"userId":"NAME","repoUrl":"...","repoName":"...","branch":"...","localPath":"...","lastCommitHash":"...","lastCommitMessage":"..."}'
   ```

6. **Get the full picture.**
   ```bash
   curl -s "$SERVER_URL/api/overview?userId=NAME" \
     -H "Authorization: Bearer $TOKEN"
   ```

7. **Check messages.**
   ```bash
   curl -s "$SERVER_URL/api/messages?userId=NAME" \
     -H "Authorization: Bearer $TOKEN"
   ```

8. **Check delegated tasks.**
   ```bash
   curl -s "$SERVER_URL/api/delegation/my-tasks/NAME" \
     -H "Authorization: Bearer $TOKEN"
   ```
   If there are pending subtasks, highlight them prominently.

9. **Report to the user.** Give a brief, friendly summary:
   - Your detected context (repo, branch)
   - Who else is online and what repo/branch they're on
   - Any shared projects available to jump into (with clone commands)
   - Any deployment status updates
   - Any broadcast messages
   - Any delegated tasks pending your response
   - Warnings if someone is editing the same files as you

## Project registry (~/.boodlebox-projects.json)

Maintain a local JSON file mapping repos to server info so users don't need
to re-discover the server each time:

```json
{
  "projects": {
    "SharedContextHelper": {
      "repoUrl": "https://github.com/zkinzler/SharedContextHelper.git",
      "serverUrl": "http://172.17.27.38:3099",
      "token": "da16f93524d962c8597e5791351b2514",
      "addedAt": "2026-03-16"
    }
  }
}
```

When connecting to a new project, always save it here for next time.

## GitHub URL sharing:

When a user says "share this project" or "let others join":
1. Get the repo URL and branch from git
2. Ask for a short description of what they're working on
3. POST to `/api/share-project` with userId, repoUrl, branch, description
4. Tell them: "Shared! Teammates will see it when they /collaborate."

When the overview shows shared projects, offer:
- "Want to clone [name]'s project? I'll run: git clone [url] && cd [dir] && git checkout [branch]"

## Deployments:

After a `vercel deploy` or similar:
- Parse the output for preview/production URLs
- POST to `/api/deployment` with platform, project name, URL, and status
- This shows up in everyone's project overview

## Ongoing behavior:

- **Before editing a shared file:** GET `/api/file-activity?filePath=...` to check for conflicts.
- **When starting a new task:** POST `/api/status` with your goal.
- **When making a big change:** POST `/api/broadcast` to let the team know.
- **After git push:** POST `/api/git-context` to update your context.
- **After deploy:** Capture and share the deploy URL via `/api/deployment`.

Keep it lightweight — update status on meaningful changes, not every keystroke.

## Task Delegation

When a user describes a big goal or project (e.g., "build a landing page with auth",
"refactor the API layer", "ship the new dashboard"):

1. **Assess the team.** GET `/api/team?userId=NAME` to see who's online.
2. **Break down the goal.** Think about the subtasks needed, considering:
   - What can be parallelized vs. what has dependencies
   - Who's best suited based on what they're currently working on
   - Priority of each subtask
3. **Present the plan to the user.** Before committing, show them:
   - The subtask breakdown
   - Who you'd assign each to and why
   - The dependency order
4. **After user approval,** POST to `/api/delegation/create`:
   ```json
   {"userId":"NAME","goal":"...","subtasks":[
     {"description":"...","assignedTo":"...","priority":"high","dependsOnIndices":[]},
     {"description":"...","assignedTo":"...","priority":"medium","dependsOnIndices":[0]}
   ]}
   ```
5. **Broadcast.** POST `/api/broadcast` to let the team know a plan was created.

When you see delegated tasks assigned to your user:
- **Pending tasks:** Ask the user if they want to accept. POST `/api/delegation/PLANID/respond`
  with `{"subtaskId":"...","userId":"...","response":"accepted"}`.
- **Accepted tasks:** When starting work, POST `/api/delegation/PLANID/update`
  with `{"subtaskId":"...","userId":"...","status":"in_progress"}`.
- **Completed tasks:** POST update with `"status":"completed"` and a `"notes"` summary.
- **Blocked tasks:** If dependencies aren't met, tell the user and show what's blocking.

## Quick commands:

- `/collaborate` — full check-in (register + overview + messages + delegated tasks)
- `/collaborate check` or `/collaborate status` — just get team overview
- `/collaborate broadcast <message>` — send a broadcast
- `/collaborate tasks` — list shared tasks
- `/collaborate share` — share current project with team
- `/collaborate delegate <goal>` — break down a goal and delegate to the team
- `/collaborate my-tasks` — check tasks delegated to you
- `/collaborate plan <planId>` — view a delegation plan's status

## REST API Reference

All endpoints require `Authorization: Bearer TOKEN` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/register | Register/heartbeat `{userId, machineId?}` |
| POST | /api/status | Update status `{userId, currentGoal?, workingFiles?, status?}` |
| GET | /api/team?userId= | Get team members |
| POST | /api/git-context | Update git info `{userId, repoUrl, repoName, branch, localPath, ...}` |
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
| POST | /api/delegation/:planId/respond | Accept/reject `{subtaskId, userId, response, reason?}` |
| POST | /api/delegation/:planId/update | Update subtask `{subtaskId, userId, status?, notes?}` |
| POST | /api/share-project | Share project `{userId, repoUrl, branch, description}` |
| POST | /api/deployment | Update deploy `{userId, platform, projectName, ...}` |
| GET | /api/file-activity?filePath=&userId= | File activity |
