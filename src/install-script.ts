export function generateInstallScript(
  serverUrl: string,
  token: string
): string {
  // The SKILL.md content embedded in the script
  const skillContent = `---
name: collaborate
description: >
  BoodleBox team collaboration. Coordinate with teammates across any project.
  Auto-detects your git repo and branch. See who's working on what, share projects,
  track deployments. Invoke when user says collaborate, team, coordinate, who's working,
  share project, check deployments, what is [name] doing, or type /collaborate.
allowed-tools: Bash(git *), Bash(hostname), Bash(cat ~/.boodlebox-user), Read
---

# BoodleBox Team Collaboration

## On startup, do this automatically:

1. **Get user identity.** Run \\\`cat ~/.boodlebox-user\\\` to get the user's name.
   If the file doesn't exist, ask for their first name and save it:
   \\\`echo "TheirName" > ~/.boodlebox-user\\\`

2. **Detect git context.** Run these commands (skip any that fail):
   - \\\`git remote get-url origin 2>/dev/null\\\` → repoUrl
   - \\\`git rev-parse --abbrev-ref HEAD 2>/dev/null\\\` → branch
   - \\\`basename -s .git $(git remote get-url origin 2>/dev/null) 2>/dev/null\\\` → repoName
   - \\\`git log -1 --format="%H|||%s" 2>/dev/null\\\` → last commit hash and message
   - \\\`pwd\\\` → localPath

3. **Register with team.** Call \\\`register_member\\\` with name and hostname.

4. **Share git context.** If git info was detected, call \\\`update_git_context\\\`
   with all gathered info.

5. **Get the full picture.** Call \\\`get_project_overview\\\` for the dashboard.

6. **Check messages.** Call \\\`get_messages\\\` for any team broadcasts.

7. **Report to the user.** Give a brief, friendly summary:
   - Your detected context (repo, branch)
   - Who else is online and what repo/branch they're on
   - Any shared projects available to jump into (with clone commands)
   - Any deployment status updates
   - Any broadcast messages
   - Warnings if someone is editing the same files as you

## GitHub URL sharing:

When a user says "share this project" or "let others join":
1. Get the repo URL and branch from git
2. Ask for a short description of what they're working on
3. Call \\\`share_project\\\` with the repo URL, branch, and description
4. Tell them: "Shared! Teammates will see it when they /collaborate."

When the overview shows shared projects, offer:
- "Want to clone [name]'s project? I'll run: git clone [url] && cd [dir] && git checkout [branch]"

## Deployments:

After a \\\`vercel deploy\\\` or similar:
- Parse the output for preview/production URLs
- Call \\\`update_deployment\\\` with platform, project name, URL, and status
- This shows up in everyone's project overview

## Ongoing behavior:

- **Before editing a shared file:** Check \\\`get_file_activity\\\` for conflicts.
- **When starting a new task:** Call \\\`update_status\\\` with your goal.
- **When making a big change:** Suggest broadcasting with \\\`broadcast_message\\\`.
- **After git push:** Offer to update git context.
- **After deploy:** Capture and share the deploy URL.

Keep it lightweight — update status on meaningful changes, not every keystroke.

## Quick commands:

- \\\`/collaborate\\\` — full check-in (register + overview + messages)
- \\\`/collaborate check\\\` or \\\`/collaborate status\\\` — just get team overview
- \\\`/collaborate broadcast <message>\\\` — send a broadcast
- \\\`/collaborate tasks\\\` — list shared tasks
- \\\`/collaborate share\\\` — share current project with team`;

  return `#!/bin/bash
# BoodleBox Shared Context — One-Click Setup
# This script configures your Claude Code to connect to the team server.
set -e

SERVER_URL="${serverUrl}"
TOKEN="${token}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BoodleBox Shared Context — Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for Claude CLI
if ! command -v claude &> /dev/null; then
  echo "ERROR: Claude Code CLI not found."
  echo "Install it first: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

# Get user's name
NAME="\${1:-}"
if [ -z "$NAME" ]; then
  read -p "What's your first name? " NAME
fi

if [ -z "$NAME" ]; then
  echo "ERROR: Name is required."
  exit 1
fi

echo "Setting up for $NAME..."
echo ""

# 1. Save user identity
echo "$NAME" > ~/.boodlebox-user
echo "[1/3] Saved identity: $NAME"

# 2. Add MCP server (user-level, works in all projects)
claude mcp remove -s user shared-context 2>/dev/null || true
claude mcp add --transport http --scope user shared-context "$SERVER_URL/mcp" --header "Authorization: Bearer $TOKEN"
echo "[2/3] Connected to BoodleBox server"

# 3. Install the /collaborate skill globally
mkdir -p ~/.claude/skills/collaborate
cat > ~/.claude/skills/collaborate/SKILL.md << 'SKILL_EOF'
${skillContent}
SKILL_EOF
echo "[3/3] Installed /collaborate skill"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All done, $NAME!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Open Claude Code in any project and type:"
echo "    /collaborate"
echo ""
echo "  Or just say: 'I want to collaborate'"
echo ""
`;
}
