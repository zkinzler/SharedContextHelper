import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";
import { generateInstallScript } from "./install-script.js";

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
