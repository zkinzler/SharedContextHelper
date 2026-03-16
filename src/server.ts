import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { state } from "./state.js";

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "shared-context-helper",
      version: "1.0.0",
    },
    {
      instructions:
        "This server enables team coordination between multiple Claude Code instances. " +
        "Use register_member when starting a session, update your status as you work, " +
        "and check team context before making changes to shared files.",
    }
  );

  // ── register_member ──────────────────────────────────

  server.tool(
    "register_member",
    "Register yourself as a team member (also serves as heartbeat). Call this at the start of each session.",
    {
      userId: z.string().describe("Your unique identifier (e.g. first name)"),
      machineId: z
        .string()
        .optional()
        .describe("Machine hostname or identifier"),
    },
    async ({ userId, machineId }) => {
      const member = state.register(userId, machineId);
      const teamSize = state.getTeamContext().length + 1; // include self
      return {
        content: [
          {
            type: "text" as const,
            text: `Registered as "${userId}". Team has ${teamSize} active member(s). Last heartbeat updated.`,
          },
        ],
      };
    }
  );

  // ── update_status ────────────────────────────────────

  server.tool(
    "update_status",
    "Update your current working status — what you're doing, which files you're editing, etc.",
    {
      userId: z.string().describe("Your user ID"),
      currentGoal: z
        .string()
        .optional()
        .describe("What you are currently working on"),
      workingFiles: z
        .array(z.string())
        .optional()
        .describe("File paths you are currently editing"),
      status: z
        .enum(["active", "idle", "away"])
        .optional()
        .describe("Your availability status"),
    },
    async ({ userId, currentGoal, workingFiles, status }) => {
      const member = state.updateStatus(userId, {
        currentGoal,
        workingFiles,
        status,
      });
      if (!member) {
        return {
          content: [
            {
              type: "text" as const,
              text: `User "${userId}" not found. Call register_member first.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Status updated for "${userId}". Goal: "${member.currentGoal || "(none)"}". Files: ${member.workingFiles.length ? member.workingFiles.join(", ") : "(none)"}. Status: ${member.status}.`,
          },
        ],
      };
    }
  );

  // ── get_team_context ─────────────────────────────────

  server.tool(
    "get_team_context",
    "See what all other team members are currently working on, their goals, files, and status.",
    {
      userId: z
        .string()
        .optional()
        .describe("Your user ID (to exclude yourself from results)"),
    },
    async ({ userId }) => {
      const members = state.getTeamContext(userId);
      if (members.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No other team members are currently active.",
            },
          ],
        };
      }
      const lines = members.map((m) => {
        const ago = Math.round((Date.now() - m.lastHeartbeat) / 1000);
        return [
          `## ${m.userId} [${m.status}]`,
          `  Machine: ${m.machineId}`,
          `  Goal: ${m.currentGoal || "(none set)"}`,
          `  Files: ${m.workingFiles.length ? m.workingFiles.join(", ") : "(none)"}`,
          `  Last seen: ${ago}s ago`,
        ].join("\n");
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Team Context (${members.length} member(s))\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    }
  );

  // ── broadcast_message ────────────────────────────────

  server.tool(
    "broadcast_message",
    "Send a message to all team members (e.g. 'I'm about to refactor the auth module, hold off on changes').",
    {
      userId: z.string().describe("Your user ID"),
      message: z.string().describe("The message to broadcast"),
      ttlMinutes: z
        .number()
        .optional()
        .default(60)
        .describe("How long the message stays visible (default 60 min)"),
    },
    async ({ userId, message, ttlMinutes }) => {
      const msg = state.broadcastMessage(userId, message, ttlMinutes);
      return {
        content: [
          {
            type: "text" as const,
            text: `Message broadcast (id: ${msg.id}): "${message}" — expires in ${ttlMinutes} min.`,
          },
        ],
      };
    }
  );

  // ── get_messages ─────────────────────────────────────

  server.tool(
    "get_messages",
    "Read broadcast messages from team members.",
    {
      since: z
        .number()
        .optional()
        .describe("Only return messages after this Unix timestamp (ms)"),
      userId: z
        .string()
        .optional()
        .describe("Your user ID (to exclude your own messages)"),
    },
    async ({ since, userId }) => {
      const msgs = state.getMessages({
        since,
        excludeFrom: userId,
      });
      if (msgs.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No new messages." },
          ],
        };
      }
      const lines = msgs.map((m) => {
        const time = new Date(m.timestamp).toISOString();
        return `[${time}] ${m.from}: ${m.message}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Messages (${msgs.length})\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── create_task ──────────────────────────────────────

  server.tool(
    "create_task",
    "Create a shared task that team members can claim.",
    {
      userId: z.string().describe("Your user ID (task creator)"),
      description: z.string().describe("What needs to be done"),
    },
    async ({ userId, description }) => {
      const task = state.createTask(description, userId);
      return {
        content: [
          {
            type: "text" as const,
            text: `Task created (id: ${task.taskId}): "${description}"`,
          },
        ],
      };
    }
  );

  // ── claim_task ───────────────────────────────────────

  server.tool(
    "claim_task",
    "Claim a task so others know you're working on it.",
    {
      taskId: z.string().describe("The task ID to claim"),
      userId: z.string().describe("Your user ID"),
    },
    async ({ taskId, userId }) => {
      const result = state.claimTask(taskId, userId);
      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Task ${taskId} claimed by ${userId}.`,
          },
        ],
      };
    }
  );

  // ── release_task ─────────────────────────────────────

  server.tool(
    "release_task",
    "Release a task you previously claimed, making it available for others.",
    {
      taskId: z.string().describe("The task ID to release"),
      userId: z.string().describe("Your user ID"),
    },
    async ({ taskId, userId }) => {
      const result = state.releaseTask(taskId, userId);
      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Task ${taskId} released. It's now open for others.`,
          },
        ],
      };
    }
  );

  // ── list_tasks ───────────────────────────────────────

  server.tool(
    "list_tasks",
    "List all shared tasks and their claim status.",
    {
      filter: z
        .enum(["open", "claimed", "completed"])
        .optional()
        .describe("Filter by task status"),
    },
    async ({ filter }) => {
      const tasks = state.listTasks(filter);
      if (tasks.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: filter
                ? `No ${filter} tasks.`
                : "No tasks exist yet.",
            },
          ],
        };
      }
      const lines = tasks.map((t) => {
        const claimed = t.claimedBy ? ` (claimed by ${t.claimedBy})` : "";
        return `- [${t.status}] ${t.taskId}: ${t.description}${claimed}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Tasks (${tasks.length})\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── update_git_context ──────────────────────────────

  server.tool(
    "update_git_context",
    "Share your current git repo, branch, and latest commit so teammates know what codebase you're in.",
    {
      userId: z.string().describe("Your user ID"),
      repoUrl: z.string().describe("Git remote URL (e.g. from `git remote get-url origin`)"),
      repoName: z.string().describe("Short repo name (e.g. boodlebox/app)"),
      branch: z.string().describe("Current branch name"),
      localPath: z.string().describe("Local directory path"),
      lastCommitHash: z.string().optional().describe("Latest commit hash"),
      lastCommitMessage: z.string().optional().describe("Latest commit message"),
      openPrUrl: z.string().optional().describe("URL of open PR for this branch"),
      openPrTitle: z.string().optional().describe("Title of open PR"),
    },
    async ({ userId, repoUrl, repoName, branch, localPath, lastCommitHash, lastCommitMessage, openPrUrl, openPrTitle }) => {
      const member = state.updateGitContext(userId, {
        repoUrl,
        repoName,
        branch,
        localPath,
        lastCommitHash,
        lastCommitMessage,
        lastCommitAt: Date.now(),
        openPrUrl,
        openPrTitle,
      });
      if (!member) {
        return {
          content: [{ type: "text" as const, text: `User "${userId}" not found. Call register_member first.` }],
          isError: true,
        };
      }
      return {
        content: [{
          type: "text" as const,
          text: `Git context updated for "${userId}": ${repoName} @ ${branch}`,
        }],
      };
    }
  );

  // ── update_deployment ──────────────────────────────

  server.tool(
    "update_deployment",
    "Share a deployment status (e.g. after running `vercel deploy`). Lets teammates see preview URLs and deploy status.",
    {
      userId: z.string().describe("Your user ID"),
      platform: z.string().describe("Deployment platform (e.g. vercel, netlify, railway)"),
      projectName: z.string().describe("Project name on the platform"),
      previewUrl: z.string().optional().describe("Preview/staging URL"),
      productionUrl: z.string().optional().describe("Production URL"),
      status: z.enum(["building", "ready", "error"]).optional().describe("Deploy status"),
      commitHash: z.string().optional().describe("Commit that was deployed"),
    },
    async ({ userId, platform, projectName, previewUrl, productionUrl, status, commitHash }) => {
      const member = state.updateDeployment(userId, {
        platform,
        projectName,
        latestPreviewUrl: previewUrl,
        latestProductionUrl: productionUrl,
        lastDeployedAt: Date.now(),
        lastDeployStatus: status,
        lastDeployCommit: commitHash,
      });
      if (!member) {
        return {
          content: [{ type: "text" as const, text: `User "${userId}" not found. Call register_member first.` }],
          isError: true,
        };
      }
      return {
        content: [{
          type: "text" as const,
          text: `Deployment updated: ${projectName} on ${platform} — ${status ?? "unknown"}\n${previewUrl ? `Preview: ${previewUrl}` : ""}`,
        }],
      };
    }
  );

  // ── share_project ──────────────────────────────────

  server.tool(
    "share_project",
    "Share a project/repo with the team so they can jump in. Teammates will see this when they run /collaborate.",
    {
      userId: z.string().describe("Your user ID"),
      repoUrl: z.string().describe("Git clone URL for the repo"),
      branch: z.string().describe("Branch to check out"),
      description: z.string().describe("What you're working on in this project"),
    },
    async ({ userId, repoUrl, branch, description }) => {
      const project = state.shareProject(userId, repoUrl, branch, description);
      return {
        content: [{
          type: "text" as const,
          text: `Project shared (id: ${project.id})!\n"${description}"\nRepo: ${repoUrl}\nBranch: ${branch}\n\nTeammates will see this when they check in. Expires in 24h.`,
        }],
      };
    }
  );

  // ── get_project_overview ───────────────────────────

  server.tool(
    "get_project_overview",
    "Full dashboard: who's on which repo/branch, recent deployments, shared projects, and team status. The go-to tool for situational awareness.",
    {
      userId: z.string().optional().describe("Your user ID (to exclude yourself)"),
    },
    async ({ userId }) => {
      const overview = state.getProjectOverview(userId);
      const sections: string[] = [];

      // Team members with git context
      if (overview.members.length > 0) {
        const memberLines = overview.members.map((m) => {
          const ago = Math.round((Date.now() - m.lastHeartbeat) / 1000);
          const lines = [`## ${m.userId} [${m.status}] (${ago}s ago)`];
          if (m.currentGoal) lines.push(`  Goal: ${m.currentGoal}`);
          if (m.gitContext) {
            lines.push(`  Repo: ${m.gitContext.repoName} @ ${m.gitContext.branch}`);
            if (m.gitContext.lastCommitMessage) {
              lines.push(`  Last commit: "${m.gitContext.lastCommitMessage}"`);
            }
            if (m.gitContext.openPrUrl) {
              lines.push(`  Open PR: ${m.gitContext.openPrTitle ?? m.gitContext.openPrUrl}`);
            }
          }
          if (m.workingFiles.length) {
            lines.push(`  Files: ${m.workingFiles.join(", ")}`);
          }
          return lines.join("\n");
        });
        sections.push(`# Team (${overview.members.length})\n\n${memberLines.join("\n\n")}`);
      } else {
        sections.push("# Team\n\nNo other members online.");
      }

      // Shared projects
      const projects = overview.sharedProjects;
      if (projects.length > 0) {
        const projLines = projects.map((p) => {
          return `- **${p.sharedBy}**: ${p.description}\n  \`git clone ${p.repoUrl} && git checkout ${p.branch}\``;
        });
        sections.push(`# Shared Projects (${projects.length})\n\n${projLines.join("\n")}`);
      }

      // Recent deployments
      if (overview.recentDeployments.length > 0) {
        const deployLines = overview.recentDeployments.slice(0, 10).map((d) => {
          const time = d.deployment.lastDeployedAt
            ? new Date(d.deployment.lastDeployedAt).toISOString()
            : "unknown";
          const url = d.deployment.latestPreviewUrl ?? d.deployment.latestProductionUrl ?? "";
          return `- **${d.userId}** → ${d.deployment.projectName} [${d.deployment.lastDeployStatus ?? "?"}] ${url} (${time})`;
        });
        sections.push(`# Deployments\n\n${deployLines.join("\n")}`);
      }

      return {
        content: [{
          type: "text" as const,
          text: sections.join("\n\n---\n\n"),
        }],
      };
    }
  );

  // ── get_file_activity ────────────────────────────────

  server.tool(
    "get_file_activity",
    "See recent file activity — who has been reading or editing which files. Useful before editing a file to check for conflicts.",
    {
      filePath: z
        .string()
        .optional()
        .describe("Filter to a specific file path"),
      userId: z
        .string()
        .optional()
        .describe("Filter to a specific user"),
    },
    async ({ filePath, userId }) => {
      const activities = state.getFileActivity({ filePath, userId });
      if (activities.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No recent file activity found.",
            },
          ],
        };
      }
      const lines = activities.slice(-50).map((a) => {
        const time = new Date(a.timestamp).toISOString();
        return `[${time}] ${a.userId} → ${a.action} ${a.filePath}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# File Activity (${activities.length} entries)\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── append_work_log ─────────────────────────────────

  server.tool(
    "append_work_log",
    "Log progress on a subtask you're working on. Use this to report commits, file changes, blockers, or general progress so the coordinator and team can see what's happening in real-time.",
    {
      planId: z.string().describe("The delegation plan ID"),
      subtaskId: z.string().describe("The subtask ID"),
      userId: z.string().describe("Your user ID"),
      type: z.enum(["progress", "commit", "file_change", "blocker", "complete"]).describe("Type of log entry"),
      message: z.string().describe("What happened"),
      metadata: z.record(z.string()).optional().describe("Optional key-value metadata (e.g. commitHash, filePath)"),
    },
    async ({ planId, subtaskId, userId, type, message, metadata }) => {
      const result = state.appendWorkLog(planId, subtaskId, userId, { type, message, metadata });
      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Logged [${type}]: ${message}`,
          },
        ],
      };
    }
  );

  // ── send_collab_request ─────────────────────────────

  server.tool(
    "send_collab_request",
    "Send a collaboration request to a teammate. They'll see it next time they check in.",
    {
      fromUserId: z.string().describe("Your user ID"),
      toUserId: z.string().describe("The teammate you want to collaborate with"),
      repoUrl: z.string().describe("Git repo URL you want to work on together"),
      repoName: z.string().describe("Short repo name"),
      branch: z.string().describe("Branch you're working on"),
      message: z.string().optional().describe("Optional message about what you want to work on"),
    },
    async ({ fromUserId, toUserId, repoUrl, repoName, branch, message }) => {
      const request = state.sendCollabRequest(fromUserId, toUserId, repoUrl, repoName, branch, message ?? "");
      return {
        content: [
          {
            type: "text" as const,
            text: `Collab request sent to ${toUserId} (id: ${request.id}).\nProject: ${repoName} @ ${branch}\nThey'll see it next time they /collaborate.`,
          },
        ],
      };
    }
  );

  // ── get_collab_requests ────────────────────────────

  server.tool(
    "get_collab_requests",
    "Check for incoming collaboration requests from teammates.",
    {
      userId: z.string().describe("Your user ID"),
    },
    async ({ userId }) => {
      const requests = state.getCollabRequests(userId);
      if (requests.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No pending collaboration requests." },
          ],
        };
      }
      const lines = requests.map((r) => {
        return `- [${r.id}] ${r.fromUserId} wants to collaborate on ${r.repoName} @ ${r.branch}${r.message ? `: "${r.message}"` : ""}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Collaboration Requests (${requests.length})\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── respond_to_collab_request ──────────────────────

  server.tool(
    "respond_to_collab_request",
    "Accept or decline a collaboration request.",
    {
      requestId: z.string().describe("The request ID"),
      userId: z.string().describe("Your user ID"),
      response: z.enum(["accepted", "declined"]).describe("Accept or decline"),
    },
    async ({ requestId, userId, response }) => {
      const result = state.respondToCollabRequest(requestId, userId, response);
      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      const req = result.request!;
      if (response === "accepted") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Accepted! You're collaborating with ${req.fromUserId} on ${req.repoName} @ ${req.branch}.\nClone: git clone ${req.repoUrl} && git checkout ${req.branch}`,
            },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: `Declined collaboration request from ${req.fromUserId}.` },
        ],
      };
    }
  );

  // ── create_delegation_plan ──────────────────────────

  server.tool(
    "create_delegation_plan",
    "Create a delegation plan that breaks a high-level goal into subtasks assigned to specific team members. You (the Claude Code instance) should analyze the goal, check who's available via get_team_context, and build the subtask breakdown.",
    {
      userId: z.string().describe("Your user ID (plan creator/coordinator)"),
      goal: z.string().describe("The high-level goal to accomplish"),
      subtasks: z
        .array(
          z.object({
            description: z.string().describe("What this subtask involves"),
            assignedTo: z
              .string()
              .describe("userId of the team member to assign this to"),
            priority: z
              .enum(["high", "medium", "low"])
              .describe("Task priority"),
            dependsOnIndices: z
              .array(z.number())
              .optional()
              .describe(
                "0-based indices of subtasks in this array that must complete before this one"
              ),
          })
        )
        .describe("The subtasks that make up this plan"),
    },
    async ({ userId, goal, subtasks }) => {
      const result = state.createDelegationPlan(goal, userId, subtasks);
      if ("error" in result) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      const lines = result.subtasks.map((s, i) => {
        const deps =
          s.dependencies.length > 0
            ? ` (after: ${s.dependencies.join(", ")})`
            : "";
        return `${i + 1}. [${s.priority}] ${s.subtaskId} → ${s.assignedTo}: ${s.description}${deps}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Delegation Plan Created (${result.planId})\n\nGoal: ${goal}\nCoordinator: ${userId}\nSubtasks: ${result.subtasks.length}\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── get_delegation_plan ───────────────────────────

  server.tool(
    "get_delegation_plan",
    "View the full status of a delegation plan and all its subtasks.",
    {
      planId: z.string().describe("The delegation plan ID"),
    },
    async ({ planId }) => {
      const plan = state.getDelegationPlan(planId);
      if (!plan) {
        return {
          content: [
            { type: "text" as const, text: "Plan not found." },
          ],
          isError: true,
        };
      }
      const lines = plan.subtasks.map((s) => {
        const deps =
          s.dependencies.length > 0
            ? ` (depends on: ${s.dependencies.join(", ")})`
            : "";
        const notes = s.notes ? ` — Notes: ${s.notes}` : "";
        const rejection =
          s.status === "rejected" && s.rejectionReason
            ? ` — Reason: ${s.rejectionReason}`
            : "";
        return `- [${s.status}] ${s.subtaskId} → ${s.assignedTo} [${s.priority}]: ${s.description}${deps}${notes}${rejection}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Plan ${plan.planId} [${plan.status}]\n\nGoal: ${plan.goal}\nCreated by: ${plan.createdBy}\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── list_delegation_plans ─────────────────────────

  server.tool(
    "list_delegation_plans",
    "List all delegation plans, optionally filtered by status.",
    {
      filter: z
        .enum(["active", "completed", "cancelled"])
        .optional()
        .describe("Filter by plan status"),
    },
    async ({ filter }) => {
      const plans = state.listDelegationPlans(filter);
      if (plans.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: filter
                ? `No ${filter} delegation plans.`
                : "No delegation plans exist yet.",
            },
          ],
        };
      }
      const lines = plans.map((p) => {
        const done = p.subtasks.filter((s) => s.status === "completed").length;
        return `- [${p.status}] ${p.planId}: ${p.goal} (${done}/${p.subtasks.length} done) — by ${p.createdBy}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Delegation Plans (${plans.length})\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── get_my_delegated_tasks ────────────────────────

  server.tool(
    "get_my_delegated_tasks",
    "See all subtasks assigned to you across all active delegation plans. Check this to see what work has been delegated to you.",
    {
      userId: z.string().describe("Your user ID"),
    },
    async ({ userId }) => {
      const tasks = state.getMyDelegatedTasks(userId);
      if (tasks.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No tasks delegated to you.",
            },
          ],
        };
      }
      const lines = tasks.map((t) => {
        const deps =
          t.subtask.dependencies.length > 0
            ? ` (blocked by: ${t.subtask.dependencies.join(", ")})`
            : "";
        return `- [${t.subtask.status}] Plan ${t.planId} "${t.goal}" → ${t.subtask.subtaskId} [${t.subtask.priority}]: ${t.subtask.description}${deps}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `# Your Delegated Tasks (${tasks.length})\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── respond_to_subtask ────────────────────────────

  server.tool(
    "respond_to_subtask",
    "Accept or reject a subtask that was delegated to you.",
    {
      planId: z.string().describe("The delegation plan ID"),
      subtaskId: z.string().describe("The subtask ID to respond to"),
      userId: z.string().describe("Your user ID"),
      response: z
        .enum(["accepted", "rejected"])
        .describe("Accept or reject the subtask"),
      reason: z
        .string()
        .optional()
        .describe("Reason for rejecting (if rejecting)"),
    },
    async ({ planId, subtaskId, userId, response, reason }) => {
      const result = state.respondToSubtask(
        planId,
        subtaskId,
        userId,
        response,
        reason
      );
      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Subtask ${subtaskId} ${response}${response === "rejected" && reason ? `: ${reason}` : ""}.`,
          },
        ],
      };
    }
  );

  // ── update_subtask_status ─────────────────────────

  server.tool(
    "update_subtask_status",
    "Update the status of a subtask you're working on — mark it in progress or completed, or add notes.",
    {
      planId: z.string().describe("The delegation plan ID"),
      subtaskId: z.string().describe("The subtask ID"),
      userId: z.string().describe("Your user ID"),
      status: z
        .enum(["in_progress", "completed"])
        .optional()
        .describe("New status"),
      notes: z
        .string()
        .optional()
        .describe("Progress notes or completion summary"),
    },
    async ({ planId, subtaskId, userId, status, notes }) => {
      const result = state.updateSubtaskStatus(planId, subtaskId, userId, {
        status,
        notes,
      });
      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Failed: ${result.error}` },
          ],
          isError: true,
        };
      }
      const plan = state.getDelegationPlan(planId);
      const planStatus = plan?.status === "completed" ? " Plan is now complete!" : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Subtask ${subtaskId} updated.${status ? ` Status: ${status}.` : ""}${notes ? ` Notes: ${notes}` : ""}${planStatus}`,
          },
        ],
      };
    }
  );

  return server;
}
