import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";
import { generateInstallScript } from "./install-script.js";
import { state } from "./state.js";

const PORT = Number(process.env.PORT ?? 3099);
const TOKEN = process.env.SHARED_CONTEXT_TOKEN ?? "";
const EXTERNAL_URL = process.env.EXTERNAL_URL ?? `http://localhost:${PORT}`;

if (!TOKEN) {
  console.error(
    "ERROR: SHARED_CONTEXT_TOKEN environment variable is required.\n" +
      "Start the server with: SHARED_CONTEXT_TOKEN=your-team-secret npm run dev"
  );
  process.exit(1);
}

const app = express();
// NOTE: Do NOT use express.json() globally — the MCP transports need to parse
// the raw request body themselves. Only apply JSON parsing to non-MCP routes.

// ── Auth middleware ─────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: "Unauthorized — invalid or missing token" });
    return;
  }
  next();
}

// ── Session tracking ───────────────────────────────────

const streamableTransports = new Map<string, StreamableHTTPServerTransport>();
const sseTransports = new Map<string, SSEServerTransport>();

// ── StreamableHTTP transport (recommended) ─────────────

app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && streamableTransports.has(sessionId)) {
    // Existing session — forward message
    const transport = streamableTransports.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  // New session — create transport + server
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      streamableTransports.set(id, transport);
      console.log(`[StreamableHTTP] Session started: ${id}`);
    },
  });

  transport.onclose = () => {
    const id = [...streamableTransports.entries()].find(
      ([, t]) => t === transport
    )?.[0];
    if (id) {
      streamableTransports.delete(id);
      console.log(`[StreamableHTTP] Session closed: ${id}`);
    }
  };

  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

// Handle GET for SSE stream on /mcp (StreamableHTTP spec)
app.get("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !streamableTransports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = streamableTransports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// Handle DELETE for session teardown
app.delete("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !streamableTransports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = streamableTransports.get(sessionId)!;
  await transport.handleRequest(req, res);
  streamableTransports.delete(sessionId);
});

// ── Legacy SSE transport (fallback) ────────────────────

app.get("/sse", requireAuth, async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  sseTransports.set(transport.sessionId, transport);
  console.log(`[SSE] Session started: ${transport.sessionId}`);

  transport.onclose = () => {
    sseTransports.delete(transport.sessionId);
    console.log(`[SSE] Session closed: ${transport.sessionId}`);
  };

  const server = createServer();
  await server.connect(transport);
});

app.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "Unknown session" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// ── Install script (no auth — this IS the onboarding) ──

app.get("/install", (_req: Request, res: Response) => {
  const script = generateInstallScript(EXTERNAL_URL, TOKEN);
  res.type("text/plain").send(script);
});

app.get("/invite", (_req: Request, res: Response) => {
  const cmd = `curl -sL ${EXTERNAL_URL}/install | bash -s -- YourName`;
  res.type("text/plain").send(
    `Share this with your team:\n\n  ${cmd}\n\nReplace "YourName" with their first name.\n`
  );
});

// ── REST API (for skill/curl access — no MCP session needed) ──

const api = express.Router();
api.use(express.json());
api.use(requireAuth as express.RequestHandler);

api.post("/register", (req: Request, res: Response) => {
  const { userId, machineId } = req.body;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const member = state.register(userId, machineId);
  const teamSize = state.getTeamContext().length + 1;
  res.json({ member, teamSize });
});

api.post("/status", (req: Request, res: Response) => {
  const { userId, currentGoal, workingFiles, status } = req.body;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const member = state.updateStatus(userId, { currentGoal, workingFiles, status });
  if (!member) { res.status(404).json({ error: "User not found. Register first." }); return; }
  res.json({ member });
});

api.get("/team", (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const members = state.getTeamContext(userId);
  res.json({ members });
});

api.post("/git-context", (req: Request, res: Response) => {
  const { userId, ...gitContext } = req.body;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const member = state.updateGitContext(userId, { ...gitContext, lastCommitAt: Date.now() });
  if (!member) { res.status(404).json({ error: "User not found. Register first." }); return; }
  res.json({ ok: true });
});

api.get("/overview", (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  res.json(state.getProjectOverview(userId));
});

api.post("/broadcast", (req: Request, res: Response) => {
  const { userId, message, ttlMinutes } = req.body;
  if (!userId || !message) { res.status(400).json({ error: "userId and message required" }); return; }
  const msg = state.broadcastMessage(userId, message, ttlMinutes);
  res.json({ message: msg });
});

api.get("/messages", (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const since = req.query.since ? Number(req.query.since) : undefined;
  res.json({ messages: state.getMessages({ since, excludeFrom: userId }) });
});

api.post("/tasks/create", (req: Request, res: Response) => {
  const { userId, description } = req.body;
  if (!userId || !description) { res.status(400).json({ error: "userId and description required" }); return; }
  res.json({ task: state.createTask(description, userId) });
});

api.get("/tasks", (req: Request, res: Response) => {
  const filter = req.query.filter as "open" | "claimed" | "completed" | undefined;
  res.json({ tasks: state.listTasks(filter) });
});

api.post("/tasks/:taskId/claim", (req: Request, res: Response) => {
  const { userId } = req.body;
  res.json(state.claimTask(req.params.taskId as string, userId));
});

api.post("/tasks/:taskId/release", (req: Request, res: Response) => {
  const { userId } = req.body;
  res.json(state.releaseTask(req.params.taskId as string, userId));
});

api.post("/tasks/:taskId/complete", (req: Request, res: Response) => {
  const { userId } = req.body;
  res.json(state.completeTask(req.params.taskId as string, userId));
});

api.post("/delegation/create", (req: Request, res: Response) => {
  const { userId, goal, subtasks } = req.body;
  if (!userId || !goal || !subtasks) { res.status(400).json({ error: "userId, goal, and subtasks required" }); return; }
  const result = state.createDelegationPlan(goal, userId, subtasks);
  if ("error" in result) { res.status(400).json(result); return; }
  res.json({ plan: result });
});

api.get("/delegation", (req: Request, res: Response) => {
  const filter = req.query.filter as "active" | "completed" | "cancelled" | undefined;
  res.json({ plans: state.listDelegationPlans(filter) });
});

api.get("/delegation/:planId", (req: Request, res: Response) => {
  const plan = state.getDelegationPlan(req.params.planId as string);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json({ plan });
});

api.get("/delegation/my-tasks/:userId", (req: Request, res: Response) => {
  res.json({ tasks: state.getMyDelegatedTasks(req.params.userId as string) });
});

api.post("/delegation/:planId/respond", (req: Request, res: Response) => {
  const { subtaskId, userId, response, reason } = req.body;
  res.json(state.respondToSubtask(req.params.planId as string, subtaskId, userId, response, reason));
});

api.post("/delegation/:planId/update", (req: Request, res: Response) => {
  const { subtaskId, userId, status, notes } = req.body;
  res.json(state.updateSubtaskStatus(req.params.planId as string, subtaskId, userId, { status, notes }));
});

api.post("/share-project", (req: Request, res: Response) => {
  const { userId, repoUrl, branch, description } = req.body;
  if (!userId || !repoUrl || !branch || !description) { res.status(400).json({ error: "userId, repoUrl, branch, description required" }); return; }
  res.json({ project: state.shareProject(userId, repoUrl, branch, description) });
});

api.post("/deployment", (req: Request, res: Response) => {
  const { userId, platform, projectName, previewUrl, productionUrl, status, commitHash } = req.body;
  if (!userId || !platform || !projectName) { res.status(400).json({ error: "userId, platform, projectName required" }); return; }
  const member = state.updateDeployment(userId, {
    platform, projectName, latestPreviewUrl: previewUrl, latestProductionUrl: productionUrl,
    lastDeployedAt: Date.now(), lastDeployStatus: status, lastDeployCommit: commitHash,
  });
  if (!member) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ok: true });
});

api.get("/file-activity", (req: Request, res: Response) => {
  const filePath = req.query.filePath as string | undefined;
  const userId = req.query.userId as string | undefined;
  res.json({ activities: state.getFileActivity({ filePath, userId }) });
});

api.post("/delegation/:planId/reassign", (req: Request, res: Response) => {
  const { subtaskId, userId, newAssignee } = req.body;
  if (!subtaskId || !userId || !newAssignee) {
    res.status(400).json({ error: "subtaskId, userId, newAssignee required" }); return;
  }
  res.json(state.reassignSubtask(req.params.planId as string, subtaskId, userId, newAssignee));
});

api.get("/delegation/:planId/summary", (req: Request, res: Response) => {
  const plan = state.getDelegationPlan(req.params.planId as string);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  const now = Date.now();
  const summary = plan.subtasks.map((s) => {
    const lastLog = s.workLog.length > 0 ? s.workLog[s.workLog.length - 1] : null;
    const lastActivity = lastLog ? Math.round((now - lastLog.timestamp) / 1000) : null;
    return {
      subtaskId: s.subtaskId,
      description: s.description,
      assignedTo: s.assignedTo,
      status: s.status,
      priority: s.priority,
      logCount: s.workLog.length,
      latestLog: lastLog ? { type: lastLog.type, message: lastLog.message } : null,
      secondsSinceLastActivity: lastActivity,
    };
  });
  res.json({ planId: plan.planId, goal: plan.goal, status: plan.status, subtasks: summary });
});

api.post("/delegation/:planId/log", (req: Request, res: Response) => {
  const { subtaskId, userId, type, message, metadata } = req.body;
  if (!subtaskId || !userId || !type || !message) {
    res.status(400).json({ error: "subtaskId, userId, type, message required" }); return;
  }
  res.json(state.appendWorkLog(req.params.planId as string, subtaskId, userId, { type, message, metadata }));
});

api.post("/collab-request", (req: Request, res: Response) => {
  const { fromUserId, toUserId, repoUrl, repoName, branch, message } = req.body;
  if (!fromUserId || !toUserId || !repoUrl || !repoName || !branch) {
    res.status(400).json({ error: "fromUserId, toUserId, repoUrl, repoName, branch required" }); return;
  }
  const request = state.sendCollabRequest(fromUserId, toUserId, repoUrl, repoName, branch, message ?? "");
  res.json({ request });
});

api.get("/collab-requests/:userId", (req: Request, res: Response) => {
  res.json({ requests: state.getCollabRequests(req.params.userId as string) });
});

api.post("/collab-request/:id/respond", (req: Request, res: Response) => {
  const { userId, response } = req.body;
  if (!userId || !response) { res.status(400).json({ error: "userId and response required" }); return; }
  res.json(state.respondToCollabRequest(req.params.id as string, userId, response));
});

app.use("/api", api);

// ── Health check ───────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    sessions: {
      streamableHTTP: streamableTransports.size,
      sse: sseTransports.size,
    },
  });
});

// ── Start ──────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nBoodleBox Shared Context Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Listening on http://0.0.0.0:${PORT}`);
  console.log(`External URL: ${EXTERNAL_URL}`);
  console.log(`Auth token: ${TOKEN.slice(0, 4)}${"*".repeat(TOKEN.length - 4)}`);
  console.log(`\nInvite your team:`);
  console.log(`  curl -sL ${EXTERNAL_URL}/install | bash -s -- TheirName`);
  console.log(`\nHealth check: http://localhost:${PORT}/health\n`);
});
