# BoodleBox Shared Context

Multiplayer Claude Code. See what your teammates are working on, share projects, coordinate in real-time.

---

## Quick Start

### If someone sent you this repo — join the team

```bash
git clone https://github.com/zkinzler/SharedContextHelper.git
cd SharedContextHelper
npm install
./join.sh
```

It'll ask for your first name. That's it — you're connected.

> **Prerequisite:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) and [Node.js 18+](https://nodejs.org/)

### If you're starting the server (first time only)

One person needs to run the server. Everyone else just runs `./join.sh`.

```bash
git clone https://github.com/zkinzler/SharedContextHelper.git
cd SharedContextHelper
npm install
./setup.sh
```

This starts the server, generates a `team-config.json` with your IP and auth token, and pushes it to the repo. Your teammates clone the repo and run `./join.sh` — everything connects automatically.

---

## Using It

Open Claude Code in **any project** and say:

```
I want to collaborate
```

Or type `/collaborate`. Claude will auto-detect your git repo, register you with the team, and show you a dashboard.

### Things you can say

| Say this to Claude | What happens |
|---|---|
| "I want to collaborate" | Full check-in: register, see team, get messages |
| "What is [name] working on?" | Shows their repo, branch, goal, files |
| "Share this project with the team" | Shares your repo URL so others can clone it |
| "Broadcast: don't touch auth.ts" | Sends alert to all teammates |
| "Create a task: fix the login bug" | Creates shared task others can claim |
| "Show me the tasks" | Lists all team tasks and who's on what |
| "Who's editing this file?" | Checks for conflicts before you edit |
| `/collaborate check` | Quick status without full registration |
| `/collaborate tasks` | List shared tasks |

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Your Claude  │     │  Their Claude │     │ Another one  │
│    Code       │     │    Code       │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                   ┌────────▼────────┐
                   │  Shared Context  │
                   │     Server       │
                   │   (this repo)    │
                   └─────────────────┘
```

Each Claude Code instance connects to the shared server via MCP. The server tracks:
- **Who's online** and their status
- **Git context** — which repo, branch, and latest commit each person is on
- **File activity** — who's editing what (warns about conflicts)
- **Deployments** — Vercel preview URLs, deploy status
- **Shared projects** — repos shared for others to jump into
- **Broadcast messages** — alerts like "I'm refactoring X, hold off"
- **Shared tasks** — create, claim, and track work across the team

---

## FAQ

**What does my teammate need to do?**
Clone this repo, run `npm install`, run `./join.sh`. That's it.

**What if the server restarts?**
State resets (it's in-memory). Everyone re-registers automatically next time they `/collaborate`.

**Can I use this across different projects?**
Yes. The setup is global — `/collaborate` works in any directory. Claude auto-detects the git repo you're in.

**What if the server IP changes?**
Run `./setup.sh` again — it updates `team-config.json` and pushes. Teammates run `git pull && ./join.sh` to reconnect.
