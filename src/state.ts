import { randomUUID } from "node:crypto";
import type {
  TeamMember,
  TaskClaim,
  BroadcastMessage,
  FileActivity,
  GitContext,
  DeploymentInfo,
  SharedProject,
} from "./types.js";

const HEARTBEAT_TIMEOUT_MS = Number(
  process.env.HEARTBEAT_TIMEOUT_MS ?? 300_000
); // 5 min
const CLEANUP_INTERVAL_MS = Number(
  process.env.CLEANUP_INTERVAL_MS ?? 60_000
); // 1 min
const REMOVE_AFTER_MS = 30 * 60_000; // 30 min no heartbeat → remove

export class StateManager {
  private members = new Map<string, TeamMember>();
  private tasks = new Map<string, TaskClaim>();
  private messages: BroadcastMessage[] = [];
  private fileActivities: FileActivity[] = [];
  private sharedProjects: SharedProject[] = [];
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  // ── Members ──────────────────────────────────────────

  register(userId: string, machineId?: string): TeamMember {
    const existing = this.members.get(userId);
    if (existing) {
      existing.lastHeartbeat = Date.now();
      existing.status = "active";
      if (machineId) existing.machineId = machineId;
      return existing;
    }
    const member: TeamMember = {
      userId,
      machineId: machineId ?? "unknown",
      currentGoal: "",
      workingFiles: [],
      status: "active",
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
    };
    this.members.set(userId, member);
    return member;
  }

  heartbeat(userId: string): boolean {
    const member = this.members.get(userId);
    if (!member) return false;
    member.lastHeartbeat = Date.now();
    member.status = "active";
    return true;
  }

  updateStatus(
    userId: string,
    updates: {
      currentGoal?: string;
      workingFiles?: string[];
      status?: "active" | "idle" | "away";
    }
  ): TeamMember | null {
    const member = this.members.get(userId);
    if (!member) return null;
    if (updates.currentGoal !== undefined)
      member.currentGoal = updates.currentGoal;
    if (updates.workingFiles !== undefined) {
      member.workingFiles = updates.workingFiles;
      for (const file of updates.workingFiles) {
        this.recordFileActivity(userId, file, "editing");
      }
    }
    if (updates.status !== undefined) member.status = updates.status;
    member.lastHeartbeat = Date.now();
    return member;
  }

  getTeamContext(excludeUserId?: string): TeamMember[] {
    const now = Date.now();
    const result: TeamMember[] = [];
    for (const member of this.members.values()) {
      if (excludeUserId && member.userId === excludeUserId) continue;
      if (
        member.status === "active" &&
        now - member.lastHeartbeat > HEARTBEAT_TIMEOUT_MS
      ) {
        member.status = "away";
      }
      result.push({ ...member });
    }
    return result;
  }

  // ── Git Context ────────────────────────────────────────

  updateGitContext(userId: string, gitContext: GitContext): TeamMember | null {
    const member = this.members.get(userId);
    if (!member) return null;
    member.gitContext = gitContext;
    member.lastHeartbeat = Date.now();
    return member;
  }

  // ── Deployments ────────────────────────────────────────

  updateDeployment(
    userId: string,
    deployment: DeploymentInfo
  ): TeamMember | null {
    const member = this.members.get(userId);
    if (!member) return null;
    if (!member.deployments) member.deployments = [];
    const idx = member.deployments.findIndex(
      (d) => d.projectName === deployment.projectName
    );
    if (idx >= 0) {
      member.deployments[idx] = deployment;
    } else {
      member.deployments.push(deployment);
    }
    member.lastHeartbeat = Date.now();
    return member;
  }

  // ── Shared Projects ────────────────────────────────────

  shareProject(
    sharedBy: string,
    repoUrl: string,
    branch: string,
    description: string
  ): SharedProject {
    const project: SharedProject = {
      id: randomUUID().slice(0, 8),
      sharedBy,
      repoUrl,
      branch,
      description,
      sharedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60_000, // 24h TTL
    };
    this.sharedProjects.push(project);
    return project;
  }

  getSharedProjects(): SharedProject[] {
    const now = Date.now();
    return this.sharedProjects.filter((p) => p.expiresAt > now);
  }

  // ── Project Overview ───────────────────────────────────

  getProjectOverview(excludeUserId?: string): {
    members: TeamMember[];
    sharedProjects: SharedProject[];
    recentDeployments: { userId: string; deployment: DeploymentInfo }[];
  } {
    const members = this.getTeamContext(excludeUserId);
    const sharedProjects = this.getSharedProjects();
    const recentDeployments: { userId: string; deployment: DeploymentInfo }[] =
      [];
    for (const member of members) {
      if (member.deployments) {
        for (const d of member.deployments) {
          recentDeployments.push({ userId: member.userId, deployment: d });
        }
      }
    }
    recentDeployments.sort(
      (a, b) =>
        (b.deployment.lastDeployedAt ?? 0) - (a.deployment.lastDeployedAt ?? 0)
    );
    return { members, sharedProjects, recentDeployments };
  }

  // ── Tasks ────────────────────────────────────────────

  createTask(description: string, createdBy: string): TaskClaim {
    const task: TaskClaim = {
      taskId: randomUUID().slice(0, 8),
      description,
      claimedBy: null,
      claimedAt: null,
      status: "open",
      createdAt: Date.now(),
      createdBy,
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  claimTask(
    taskId: string,
    userId: string
  ): { success: boolean; task?: TaskClaim; error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: "Task not found" };
    if (task.status === "claimed" && task.claimedBy !== userId) {
      return {
        success: false,
        error: `Already claimed by ${task.claimedBy}`,
        task,
      };
    }
    task.claimedBy = userId;
    task.claimedAt = Date.now();
    task.status = "claimed";
    return { success: true, task };
  }

  releaseTask(
    taskId: string,
    userId: string
  ): { success: boolean; error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: "Task not found" };
    if (task.claimedBy !== userId) {
      return { success: false, error: `Task is claimed by ${task.claimedBy}` };
    }
    task.claimedBy = null;
    task.claimedAt = null;
    task.status = "open";
    return { success: true };
  }

  completeTask(
    taskId: string,
    userId: string
  ): { success: boolean; error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: "Task not found" };
    if (task.claimedBy && task.claimedBy !== userId) {
      return { success: false, error: `Task is claimed by ${task.claimedBy}` };
    }
    task.status = "completed";
    task.claimedBy = userId;
    return { success: true };
  }

  listTasks(filter?: "open" | "claimed" | "completed"): TaskClaim[] {
    const all = Array.from(this.tasks.values());
    if (!filter) return all;
    return all.filter((t) => t.status === filter);
  }

  // ── Messages ─────────────────────────────────────────

  broadcastMessage(
    from: string,
    message: string,
    ttlMinutes: number = 60
  ): BroadcastMessage {
    const msg: BroadcastMessage = {
      id: randomUUID().slice(0, 8),
      from,
      message,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMinutes * 60_000,
    };
    this.messages.push(msg);
    return msg;
  }

  getMessages(opts?: {
    since?: number;
    excludeFrom?: string;
  }): BroadcastMessage[] {
    const now = Date.now();
    return this.messages.filter((m) => {
      if (m.expiresAt < now) return false;
      if (opts?.since && m.timestamp < opts.since) return false;
      if (opts?.excludeFrom && m.from === opts.excludeFrom) return false;
      return true;
    });
  }

  // ── File Activity ────────────────────────────────────

  recordFileActivity(
    userId: string,
    filePath: string,
    action: FileActivity["action"]
  ): void {
    this.fileActivities.push({
      filePath,
      userId,
      action,
      timestamp: Date.now(),
    });
    if (this.fileActivities.length > 500) {
      this.fileActivities = this.fileActivities.slice(-500);
    }
  }

  getFileActivity(opts?: {
    filePath?: string;
    userId?: string;
  }): FileActivity[] {
    const cutoff = Date.now() - 60 * 60_000;
    return this.fileActivities.filter((a) => {
      if (a.timestamp < cutoff) return false;
      if (opts?.filePath && a.filePath !== opts.filePath) return false;
      if (opts?.userId && a.userId !== opts.userId) return false;
      return true;
    });
  }

  // ── Cleanup ──────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now();
    for (const [id, member] of this.members) {
      if (now - member.lastHeartbeat > REMOVE_AFTER_MS) {
        this.members.delete(id);
      } else if (now - member.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        member.status = "away";
      }
    }
    this.messages = this.messages.filter((m) => m.expiresAt > now);
    this.sharedProjects = this.sharedProjects.filter(
      (p) => p.expiresAt > now
    );
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

// Singleton
export const state = new StateManager();
