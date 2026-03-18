import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  TeamMember,
  TaskClaim,
  BroadcastMessage,
  SharedProject,
  DelegationPlan,
  CollabRequest,
} from "./types.js";

const DB_PATH = process.env.DB_PATH ?? (
  existsSync("/data") ? "/data/boodlebox.db" : "./boodlebox.db"
);

export class PersistenceLayer {
  private db: Database.Database;

  constructor() {
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.createTables();
    console.log(`[DB] SQLite database at ${DB_PATH}`);
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS members (
        userId TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        taskId TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        expiresAt INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS shared_projects (
        id TEXT PRIMARY KEY,
        expiresAt INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS delegation_plans (
        planId TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collab_requests (
        id TEXT PRIMARY KEY,
        expiresAt INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  // ── Members ──────────────────────────────────────────

  saveMember(member: TeamMember): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO members (userId, data) VALUES (?, ?)"
    ).run(member.userId, JSON.stringify(member));
  }

  loadMembers(): Map<string, TeamMember> {
    const rows = this.db.prepare("SELECT data FROM members").all() as { data: string }[];
    const map = new Map<string, TeamMember>();
    for (const row of rows) {
      const m = JSON.parse(row.data) as TeamMember;
      map.set(m.userId, m);
    }
    return map;
  }

  deleteMember(userId: string): void {
    this.db.prepare("DELETE FROM members WHERE userId = ?").run(userId);
  }

  // ── Tasks ────────────────────────────────────────────

  saveTask(task: TaskClaim): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO tasks (taskId, data) VALUES (?, ?)"
    ).run(task.taskId, JSON.stringify(task));
  }

  loadTasks(): Map<string, TaskClaim> {
    const rows = this.db.prepare("SELECT data FROM tasks").all() as { data: string }[];
    const map = new Map<string, TaskClaim>();
    for (const row of rows) {
      const t = JSON.parse(row.data) as TaskClaim;
      map.set(t.taskId, t);
    }
    return map;
  }

  // ── Messages ─────────────────────────────────────────

  saveMessage(msg: BroadcastMessage): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO messages (id, expiresAt, data) VALUES (?, ?, ?)"
    ).run(msg.id, msg.expiresAt, JSON.stringify(msg));
  }

  loadMessages(): BroadcastMessage[] {
    const now = Date.now();
    const rows = this.db.prepare(
      "SELECT data FROM messages WHERE expiresAt > ?"
    ).all(now) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as BroadcastMessage);
  }

  cleanupMessages(): void {
    this.db.prepare("DELETE FROM messages WHERE expiresAt <= ?").run(Date.now());
  }

  // ── Shared Projects ──────────────────────────────────

  saveSharedProject(project: SharedProject): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO shared_projects (id, expiresAt, data) VALUES (?, ?, ?)"
    ).run(project.id, project.expiresAt, JSON.stringify(project));
  }

  loadSharedProjects(): SharedProject[] {
    const now = Date.now();
    const rows = this.db.prepare(
      "SELECT data FROM shared_projects WHERE expiresAt > ?"
    ).all(now) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as SharedProject);
  }

  cleanupSharedProjects(): void {
    this.db.prepare("DELETE FROM shared_projects WHERE expiresAt <= ?").run(Date.now());
  }

  // ── Delegation Plans ─────────────────────────────────

  saveDelegationPlan(plan: DelegationPlan): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO delegation_plans (planId, data) VALUES (?, ?)"
    ).run(plan.planId, JSON.stringify(plan));
  }

  loadDelegationPlans(): Map<string, DelegationPlan> {
    const rows = this.db.prepare("SELECT data FROM delegation_plans").all() as { data: string }[];
    const map = new Map<string, DelegationPlan>();
    for (const row of rows) {
      const p = JSON.parse(row.data) as DelegationPlan;
      map.set(p.planId, p);
    }
    return map;
  }

  deleteDelegationPlan(planId: string): void {
    this.db.prepare("DELETE FROM delegation_plans WHERE planId = ?").run(planId);
  }

  // ── Collab Requests ──────────────────────────────────

  saveCollabRequest(request: CollabRequest): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO collab_requests (id, expiresAt, data) VALUES (?, ?, ?)"
    ).run(request.id, request.expiresAt, JSON.stringify(request));
  }

  loadCollabRequests(): CollabRequest[] {
    const now = Date.now();
    const rows = this.db.prepare(
      "SELECT data FROM collab_requests WHERE expiresAt > ?"
    ).all(now) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as CollabRequest);
  }

  cleanupCollabRequests(): void {
    this.db.prepare("DELETE FROM collab_requests WHERE expiresAt <= ?").run(Date.now());
  }

  // ── Cleanup ──────────────────────────────────────────

  cleanupAll(): void {
    this.cleanupMessages();
    this.cleanupSharedProjects();
    this.cleanupCollabRequests();
  }

  close(): void {
    this.db.close();
  }
}
