import { randomUUID } from "node:crypto";
import type {
  TeamMember,
  TaskClaim,
  BroadcastMessage,
  FileActivity,
  GitContext,
  DeploymentInfo,
  SharedProject,
  DelegationPlan,
  DelegationSubtask,
  CollabRequest,
  WorkLogEntry,
} from "./types.js";
import { PersistenceLayer } from "./db.js";

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
  private delegationPlans = new Map<string, DelegationPlan>();
  private collabRequests: CollabRequest[] = [];
  private cleanupTimer: ReturnType<typeof setInterval>;
  private db: PersistenceLayer;

  constructor() {
    this.db = new PersistenceLayer();
    // Load persisted state
    this.members = this.db.loadMembers();
    this.tasks = this.db.loadTasks();
    this.messages = this.db.loadMessages();
    this.sharedProjects = this.db.loadSharedProjects();
    this.delegationPlans = this.db.loadDelegationPlans();
    this.collabRequests = this.db.loadCollabRequests();
    console.log(`[DB] Loaded: ${this.members.size} members, ${this.tasks.size} tasks, ${this.delegationPlans.size} plans`);
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
    this.db.saveMember(member);
    return member;
  }

  heartbeat(userId: string): boolean {
    const member = this.members.get(userId);
    if (!member) return false;
    member.lastHeartbeat = Date.now();
    member.status = "active";
    this.db.saveMember(member);
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
    this.db.saveMember(member);
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
    this.db.saveMember(member);
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
    this.db.saveMember(member);
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
    this.db.saveSharedProject(project);
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
    this.db.saveTask(task);
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
    this.db.saveTask(task);
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
    this.db.saveTask(task);
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
    this.db.saveTask(task);
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
    this.db.saveMessage(msg);
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

  // ── Delegation Plans ────────────────────────────────

  createDelegationPlan(
    goal: string,
    createdBy: string,
    subtasks: Array<{
      description: string;
      assignedTo: string;
      priority: "high" | "medium" | "low";
      dependsOnIndices?: number[];
      context?: string;
      filesToExamine?: string[];
      approach?: string;
    }>
  ): DelegationPlan | { error: string } {
    if (subtasks.length === 0) {
      return { error: "At least one subtask is required" };
    }
    const subtaskIds = subtasks.map(() => randomUUID().slice(0, 8));
    for (const s of subtasks) {
      if (s.dependsOnIndices) {
        for (const idx of s.dependsOnIndices) {
          if (idx < 0 || idx >= subtasks.length) {
            return { error: `Invalid dependency index ${idx}` };
          }
        }
      }
    }
    const resolvedSubtasks: DelegationSubtask[] = subtasks.map((s, i) => ({
      subtaskId: subtaskIds[i],
      description: s.description,
      assignedTo: s.assignedTo,
      status: "pending" as const,
      priority: s.priority,
      dependencies: (s.dependsOnIndices ?? []).map((idx) => subtaskIds[idx]),
      context: s.context,
      filesToExamine: s.filesToExamine,
      approach: s.approach,
      workLog: [],
    }));
    const plan: DelegationPlan = {
      planId: randomUUID().slice(0, 8),
      goal,
      createdBy,
      createdAt: Date.now(),
      status: "active",
      subtasks: resolvedSubtasks,
    };
    this.delegationPlans.set(plan.planId, plan);
    this.db.saveDelegationPlan(plan);
    return plan;
  }

  getDelegationPlan(planId: string): DelegationPlan | null {
    return this.delegationPlans.get(planId) ?? null;
  }

  listDelegationPlans(
    filter?: "active" | "completed" | "cancelled"
  ): DelegationPlan[] {
    const all = Array.from(this.delegationPlans.values());
    if (!filter) return all;
    return all.filter((p) => p.status === filter);
  }

  getMyDelegatedTasks(
    userId: string
  ): Array<{ planId: string; goal: string; subtask: DelegationSubtask }> {
    const results: Array<{
      planId: string;
      goal: string;
      subtask: DelegationSubtask;
    }> = [];
    for (const plan of this.delegationPlans.values()) {
      if (plan.status !== "active") continue;
      for (const subtask of plan.subtasks) {
        if (subtask.assignedTo === userId) {
          results.push({ planId: plan.planId, goal: plan.goal, subtask });
        }
      }
    }
    return results;
  }

  respondToSubtask(
    planId: string,
    subtaskId: string,
    userId: string,
    response: "accepted" | "rejected",
    reason?: string
  ): { success: boolean; error?: string } {
    const plan = this.delegationPlans.get(planId);
    if (!plan) return { success: false, error: "Plan not found" };
    const subtask = plan.subtasks.find((s) => s.subtaskId === subtaskId);
    if (!subtask) return { success: false, error: "Subtask not found" };
    if (subtask.assignedTo !== userId) {
      return { success: false, error: "This subtask is not assigned to you" };
    }
    if (subtask.status !== "pending") {
      return {
        success: false,
        error: `Subtask is already ${subtask.status}`,
      };
    }
    if (response === "accepted") {
      subtask.status = "accepted";
      subtask.acceptedAt = Date.now();
    } else {
      subtask.status = "rejected";
      subtask.rejectionReason = reason;
    }
    this.db.saveDelegationPlan(plan);
    // Auto-notify the coordinator
    const verb = response === "accepted" ? "accepted" : `rejected${reason ? ` (${reason})` : ""}`;
    this.broadcastMessage(
      "system",
      `${userId} ${verb} subtask: "${subtask.description}" (plan: ${plan.goal})`,
      120
    );
    return { success: true };
  }

  updateSubtaskStatus(
    planId: string,
    subtaskId: string,
    userId: string,
    updates: { status?: "in_progress" | "completed"; notes?: string }
  ): { success: boolean; error?: string } {
    const plan = this.delegationPlans.get(planId);
    if (!plan) return { success: false, error: "Plan not found" };
    const subtask = plan.subtasks.find((s) => s.subtaskId === subtaskId);
    if (!subtask) return { success: false, error: "Subtask not found" };
    if (subtask.assignedTo !== userId) {
      return { success: false, error: "This subtask is not assigned to you" };
    }
    if (updates.status === "in_progress") {
      if (subtask.status !== "accepted" && subtask.status !== "pending") {
        return {
          success: false,
          error: `Cannot start subtask with status "${subtask.status}"`,
        };
      }
      subtask.status = "in_progress";
    }
    if (updates.status === "completed") {
      subtask.status = "completed";
      subtask.completedAt = Date.now();
    }
    if (updates.notes !== undefined) {
      subtask.notes = updates.notes;
    }
    // Auto-notify on completion
    if (updates.status === "completed") {
      this.broadcastMessage(
        "system",
        `${userId} completed: "${subtask.description}"${updates.notes ? ` — ${updates.notes}` : ""} (plan: ${plan.goal})`,
        120
      );
    }
    // Auto-complete plan if all subtasks are done
    const allDone = plan.subtasks.every(
      (s) => s.status === "completed" || s.status === "rejected"
    );
    if (allDone) {
      plan.status = "completed";
      this.broadcastMessage(
        "system",
        `Plan "${plan.goal}" is complete! All subtasks done.`,
        120
      );
    }
    this.db.saveDelegationPlan(plan);
    return { success: true };
  }

  reassignSubtask(
    planId: string,
    subtaskId: string,
    requesterId: string,
    newAssignee: string
  ): { success: boolean; error?: string } {
    const plan = this.delegationPlans.get(planId);
    if (!plan) return { success: false, error: "Plan not found" };
    if (plan.createdBy !== requesterId) {
      return { success: false, error: "Only the plan creator can reassign subtasks" };
    }
    const subtask = plan.subtasks.find((s) => s.subtaskId === subtaskId);
    if (!subtask) return { success: false, error: "Subtask not found" };
    const oldAssignee = subtask.assignedTo;
    subtask.assignedTo = newAssignee;
    subtask.status = "pending";
    subtask.rejectionReason = undefined;
    subtask.acceptedAt = undefined;
    subtask.completedAt = undefined;
    subtask.workLog = [];
    this.db.saveDelegationPlan(plan);
    this.broadcastMessage(
      "system",
      `${requesterId} reassigned "${subtask.description}" from ${oldAssignee} to ${newAssignee} (plan: ${plan.goal})`,
      120
    );
    return { success: true };
  }

  appendWorkLog(
    planId: string,
    subtaskId: string,
    userId: string,
    entry: { type: WorkLogEntry["type"]; message: string; metadata?: Record<string, string> }
  ): { success: boolean; error?: string } {
    const plan = this.delegationPlans.get(planId);
    if (!plan) return { success: false, error: "Plan not found" };
    const subtask = plan.subtasks.find((s) => s.subtaskId === subtaskId);
    if (!subtask) return { success: false, error: "Subtask not found" };
    if (subtask.assignedTo !== userId) {
      return { success: false, error: "This subtask is not assigned to you" };
    }
    subtask.workLog.push({
      timestamp: Date.now(),
      type: entry.type,
      message: entry.message,
      metadata: entry.metadata,
    });
    if (subtask.workLog.length > 50) {
      subtask.workLog = subtask.workLog.slice(-50);
    }
    this.db.saveDelegationPlan(plan);
    return { success: true };
  }

  // ── Collab Requests ─────────────────────────────────

  sendCollabRequest(
    fromUserId: string,
    toUserId: string,
    repoUrl: string,
    repoName: string,
    branch: string,
    message: string
  ): CollabRequest {
    const request: CollabRequest = {
      id: randomUUID().slice(0, 8),
      fromUserId,
      toUserId,
      repoUrl,
      repoName,
      branch,
      message,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60_000,
    };
    this.collabRequests.push(request);
    this.db.saveCollabRequest(request);
    return request;
  }

  getCollabRequests(userId: string): CollabRequest[] {
    const now = Date.now();
    return this.collabRequests.filter(
      (r) => r.toUserId === userId && r.status === "pending" && r.expiresAt > now
    );
  }

  respondToCollabRequest(
    requestId: string,
    userId: string,
    response: "accepted" | "declined"
  ): { success: boolean; request?: CollabRequest; error?: string } {
    const request = this.collabRequests.find((r) => r.id === requestId);
    if (!request) return { success: false, error: "Request not found" };
    if (request.toUserId !== userId) {
      return { success: false, error: "This request is not for you" };
    }
    if (request.status !== "pending") {
      return { success: false, error: `Request is already ${request.status}` };
    }
    request.status = response;
    this.db.saveCollabRequest(request);
    return { success: true, request };
  }

  // ── Cleanup ──────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now();
    for (const [id, member] of this.members) {
      if (now - member.lastHeartbeat > REMOVE_AFTER_MS) {
        this.members.delete(id);
        this.db.deleteMember(id);
      } else if (now - member.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        member.status = "away";
      }
    }
    this.messages = this.messages.filter((m) => m.expiresAt > now);
    this.sharedProjects = this.sharedProjects.filter(
      (p) => p.expiresAt > now
    );
    this.collabRequests = this.collabRequests.filter(
      (r) => r.expiresAt > now
    );
    this.db.cleanupAll();
    for (const [id, plan] of this.delegationPlans) {
      if (
        plan.status === "active" &&
        now - plan.createdAt > 24 * 60 * 60_000
      ) {
        this.delegationPlans.delete(id);
        this.db.deleteDelegationPlan(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.db.close();
  }
}

// Singleton
export const state = new StateManager();
