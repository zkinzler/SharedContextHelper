# SharedContextHelper — Instructions for Claude Code

## IMPORTANT: Do NOT start a local server

The collaboration server is **already running in the cloud** at:
`https://shared-context-helper-production.up.railway.app`

**Do NOT run any of these commands:**
- `./setup.sh` — this creates a NEW server (only needed for first-time infrastructure setup)
- `npm run dev` or `npm run start` or `npx tsx src/index.ts` — the server is already deployed
- Do NOT modify `team-config.json` — it has the cloud server URL

## What to do when someone says "collaborate" or "I want to collaborate"

Use the `/collaborate` skill. It handles everything automatically:
1. Reads `~/.boodlebox-config.json` or `team-config.json` for connection info
2. Connects to the cloud server via REST API (curl)
3. Shows the team dashboard

## First-time setup for a new teammate

If `~/.boodlebox-config.json` doesn't exist, create it from `team-config.json`:
```bash
USER=$(cat ~/.boodlebox-user 2>/dev/null)
TC=$(cat team-config.json)
SERVER_URL=$(echo "$TC" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
TOKEN=$(echo "$TC" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/')
```
Then save to `~/.boodlebox-config.json` and proceed.

If the user doesn't have a name yet (`~/.boodlebox-user` missing), ask for their first name and save it.

## Development

This is a Node.js/TypeScript MCP server. If someone wants to develop the server code:
- `npm install` — install dependencies
- `npm run build` — compile TypeScript
- `npm run dev` — run locally (only for development, not for collaboration)
- Deploy: `railway up --detach`
