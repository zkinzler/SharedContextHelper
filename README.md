# BoodleBox Shared Context

Multiplayer Claude Code. See what your teammates are working on across any project, delegate tasks, send collaboration requests, and coordinate in real-time.

---

## Quick Start (Teammates)

```bash
git clone https://github.com/zkinzler/SharedContextHelper.git
cd SharedContextHelper
npm install
./join.sh
```

It asks for your first name. That's it — you're connected globally. Works from any project directory.

> **Prerequisite:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) and [Node.js 18+](https://nodejs.org/)

---

## Using It

Open Claude Code in **any project** and say:

```
I want to collaborate
```

Or type `/collaborate`. Claude auto-detects your git repo, connects to the team server, and shows you a dashboard of everyone across all projects.

### Things you can say

| Say this | What happens |
|---|---|
| "I want to collaborate" | Full check-in: dashboard, messages, tasks, collab requests |
| "I want to collaborate on [GitHub URL]" | Connects you to that project, shows who's working on it |
| "I want to work with Alex" | Sends Alex a collab request — they see it next time they check in |
| "What is Alex working on?" | Shows their repo, branch, goal, files |
| "Delegate: build a landing page with auth" | Breaks it into subtasks, assigns to teammates, tracks progress |
| "Share this project with the team" | Shares your repo URL so others can clone it |
| "Broadcast: don't touch auth.ts" | Sends alert to all teammates |
| "Create a task: fix the login bug" | Creates shared task others can claim |
| `/collaborate status` | Quick team overview |
| `/collaborate my-tasks` | Tasks delegated to you |
| `/collaborate delegate <goal>` | Break down and assign a goal |
| `/collaborate work with <person>` | Send a collaboration request |

### Collaboration Requests

When you say "I want to work with Alex", Claude sends a collaboration request. Alex sees it the next time they `/collaborate`:

> "Zach wants to collaborate with you on SharedContextHelper @ main: 'Let's pair on the auth flow'"

Alex can accept (gets the clone command) or decline.

### Task Delegation

Describe a big goal and Claude will:
1. Check who's online and what they're working on
2. Break the goal into subtasks with priorities and dependencies
3. Show you the plan for approval
4. Assign subtasks to teammates
5. Broadcast to the team

Teammates see their assigned tasks when they `/collaborate` and can accept, start, and complete them. The plan auto-completes when all subtasks are done.

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Your Claude  │     │  Their Claude │     │ Another one  │
│    Code       │     │    Code       │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │  REST API (curl)
                   ┌────────▼────────┐
                   │  Shared Context  │
                   │     Server       │
                   │  (Railway cloud) │
                   └─────────────────┘
```

Each Claude Code instance connects via REST API (curl). No MCP setup, no session restarts. The server tracks:

- **Who's online** and their status across all projects
- **Git context** — which repo, branch, and latest commit each person is on
- **Collaboration requests** — "I want to work with you on X"
- **Task delegation** — break goals into subtasks assigned to teammates
- **File activity** — who's editing what (warns about conflicts)
- **Deployments** — preview URLs, deploy status
- **Shared projects** — repos shared for others to discover
- **Broadcast messages** — alerts like "I'm refactoring X, hold off"
- **Shared tasks** — create, claim, and track work across the team

### One config, all projects

After running `./join.sh` once, a single `~/.boodlebox-config.json` file stores your server connection. `/collaborate` works from any directory — no per-repo setup needed.

---

## Server Setup (first time, one person)

The server is deployed on Railway. If you need to set up a new one:

```bash
git clone https://github.com/zkinzler/SharedContextHelper.git
cd SharedContextHelper
npm install
./setup.sh
```

This starts the server, generates `team-config.json`, and pushes it. Teammates clone and run `./join.sh`.

To deploy to Railway (recommended for teams):
```bash
brew install railway
railway login
railway init --name shared-context-helper
railway up --detach
railway domain  # generates public URL
railway variables set SHARED_CONTEXT_TOKEN=your-token
railway variables set EXTERNAL_URL=https://your-url.up.railway.app
```

Update `team-config.json` with the Railway URL and push.

---

## FAQ

**What does my teammate need to do?**
Clone this repo, run `npm install`, run `./join.sh`. Then `/collaborate` works everywhere.

**Does this work across different projects?**
Yes. One server handles all projects. Each person's repo/branch is tracked separately. You can see who's working on what across everything.

**What if the server restarts?**
State resets (it's in-memory). Everyone re-registers automatically next time they `/collaborate`.

**Do I need to restart Claude Code after setup?**
No. The skill uses REST API calls (curl), not MCP. It works instantly in any session.

**Can teammates in different network environments connect?**
Yes — the Railway deployment gives a public HTTPS URL that works through any proxy or firewall.
