# BoodleBox Shared Context

Multiplayer Claude Code. Collaborate across any project — delegate tasks, see what teammates are working on, and let your Claudes coordinate with each other in real-time.

---

## Getting Started

### For teammates (this is all you need)

```bash
git clone https://github.com/zkinzler/SharedContextHelper.git
cd SharedContextHelper
```

Open Claude Code and say:

```
I want to collaborate
```

That's it. Claude handles the rest — detects the server, asks for your name, connects you, and shows the team dashboard. No setup commands, no config, no restarts.

> **Prerequisite:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) and [Node.js 18+](https://nodejs.org/)

---

## What You Can Do

### See your team

Say `/collaborate` or "I want to collaborate" to see who's online across all projects:

> **Zach** — SharedContextHelper @ main — "Improving delegation system"
> **Mike** — boodlebox-app @ feature/auth — "Building login flow"
> **Alex** — idle (last seen 5 min ago)

### Work with someone

Say "I want to work with Mike" and Claude sends a collaboration request. Mike sees it next time he checks in:

> "Zach wants to collaborate with you on SharedContextHelper @ main"

Mike accepts and gets the clone command automatically.

### Delegate work

Describe a big goal and Claude breaks it down, assigns subtasks to teammates, and tracks progress:

> **You:** "Delegate: build a landing page with auth"
>
> Claude creates a plan:
> 1. [high] Design hero section → Alex
> 2. [high] Build auth flow → Zach (depends on #1)
> 3. [medium] Write tests → Mike (depends on #2)

Each teammate's Claude picks up their tasks, works on them, and reports progress with a real-time work log.

### Everything else

| Say this | What happens |
|---|---|
| `/collaborate` | Full dashboard: team, messages, tasks, collab requests |
| "I want to work with [name]" | Send them a collaboration request |
| "Delegate: [goal]" | Break down goal, assign to teammates, track progress |
| "What is [name] working on?" | Shows their repo, branch, goal, files |
| "Share this project" | Share your repo so teammates can discover it |
| "Broadcast: don't touch auth.ts" | Send alert to all teammates |
| `/collaborate my-tasks` | See tasks delegated to you |
| `/collaborate plan [id]` | View a delegation plan's progress and work logs |
| `/collaborate status` | Quick team overview |

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Your Claude  │     │  Mike's Claude│     │ Alex's Claude │
│    Code       │     │    Code       │     │    Code       │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │  REST API
                   ┌────────▼────────┐
                   │  Shared Context  │
                   │     Server       │
                   │  (Railway cloud) │
                   └─────────────────┘
```

- **One cloud server** handles all projects and all teammates
- Claude Code connects via **REST API (curl)** — no MCP setup, no restarts
- After first use, `~/.boodlebox-config.json` stores your connection — works from any directory
- Each person's git context (repo, branch, commits) is tracked separately

### What the server tracks

- **Team presence** — who's online, what they're working on
- **Git context** — repo, branch, latest commit per person
- **Collaboration requests** — "I want to work with you on X"
- **Task delegation** — goals broken into subtasks with dependencies
- **Work logs** — real-time progress: file changes, commits, blockers
- **Broadcast messages** — team-wide alerts
- **Shared projects** — repos shared for others to discover
- **File activity** — who's editing what (conflict warnings)
- **Deployments** — preview URLs, deploy status

---

## FAQ

**What does my teammate need to do?**
Clone this repo, open Claude Code, say "I want to collaborate". That's it.

**Does this work across different projects?**
Yes. One server handles all projects. `/collaborate` works from any directory. Each person's repo and branch is tracked separately.

**Do I need to restart Claude Code?**
No. Everything works via REST API — no session restart needed.

**What if the server restarts?**
State resets (it's in-memory). Everyone re-registers automatically on their next `/collaborate`.

**Can teammates behind corporate proxies connect?**
Yes — the server runs on Railway with a public HTTPS URL that works through any proxy.

**Can I develop the server code?**
Yes — `npm install`, `npm run build`, `npm run dev` for local development. Deploy with `railway up --detach`. See CLAUDE.md for details.
