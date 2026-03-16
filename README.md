# BoodleBox Shared Context

Multiplayer Claude Code. See what your teammates are working on, share projects, coordinate in real-time.

---

## Quick Start (2 minutes)

### 1. One person starts the server

```bash
git clone https://github.com/zkinzler/SharedContextHelper.git
cd SharedContextHelper
npm install
./setup.sh
```

The server will start and print something like this:

```
Your team invite command (send this to everyone):

  curl -sL http://192.168.1.50:3099/install | bash -s -- TheirName
```

Copy that command. You'll send it to your team.

### 2. Everyone else (including you) runs the invite command

Paste the command from step 1 into your terminal. Replace `TheirName` with your first name:

```bash
curl -sL http://192.168.1.50:3099/install | bash -s -- Zach
```

That's it. This automatically:
- Connects your Claude Code to the team server
- Installs the `/collaborate` skill
- Saves your name

> **Note:** You need [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed. If you don't have it yet, install it first.

### 3. Use it

Open Claude Code in **any project** and say:

```
I want to collaborate
```

Or type `/collaborate`. Claude will check in with the team and show you a dashboard of who's online, what they're working on, and any shared projects or messages.

---

## What You Can Do

| Say this to Claude | What happens |
|---|---|
| "I want to collaborate" | Full check-in: register, see team, get messages |
| "What is Marcus working on?" | Shows their repo, branch, goal, files |
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
- **Who's online** and their status (active/idle/away)
- **Git context** — which repo, branch, and latest commit each person is on
- **File activity** — who's editing what (warns about conflicts)
- **Deployments** — Vercel preview URLs, deploy status
- **Shared projects** — repos shared for others to jump into (with clone commands)
- **Broadcast messages** — alerts like "I'm refactoring X, hold off"
- **Shared tasks** — create, claim, and track work across the team

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- Everyone on the same network (or server accessible over the internet)

---

## FAQ

**Do I need to run the server on my machine?**
One person runs it. Everyone else just runs the invite command. It can run on any machine — your laptop, a shared dev server, a cloud VM, etc.

**What if the server restarts?**
State is in-memory, so it resets. That's fine — it's coordination data, not permanent storage. Everyone just re-registers automatically next time they `/collaborate`.

**Can I use this across different projects?**
Yes. The install is global — it works in any directory. Claude auto-detects the git repo you're in.

**Is it secure?**
The server uses a shared Bearer token for auth. Good enough for a small team on a trusted network. Don't expose it to the public internet without additional security.

**How many people can use it?**
Designed for 5-6 concurrent users. No database needed at that scale.
