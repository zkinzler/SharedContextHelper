export interface GitContext {
  repoUrl: string;
  repoName: string;
  branch: string;
  localPath: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastCommitAt?: number;
  openPrUrl?: string;
  openPrTitle?: string;
}

export interface DeploymentInfo {
  platform: string;
  projectName: string;
  latestPreviewUrl?: string;
  latestProductionUrl?: string;
  lastDeployedAt?: number;
  lastDeployStatus?: "building" | "ready" | "error";
  lastDeployCommit?: string;
}

export interface TeamMember {
  userId: string;
  machineId: string;
  currentGoal: string;
  workingFiles: string[];
  status: "active" | "idle" | "away";
  lastHeartbeat: number;
  registeredAt: number;
  gitContext?: GitContext;
  deployments?: DeploymentInfo[];
}

export interface TaskClaim {
  taskId: string;
  description: string;
  claimedBy: string | null;
  claimedAt: number | null;
  status: "open" | "claimed" | "completed";
  createdAt: number;
  createdBy: string;
}

export interface BroadcastMessage {
  id: string;
  from: string;
  message: string;
  timestamp: number;
  expiresAt: number;
}

export interface FileActivity {
  filePath: string;
  userId: string;
  action: "editing" | "reading" | "created" | "deleted";
  timestamp: number;
}

export interface SharedProject {
  id: string;
  sharedBy: string;
  repoUrl: string;
  branch: string;
  description: string;
  sharedAt: number;
  expiresAt: number;
}

export interface CollabRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  repoUrl: string;
  repoName: string;
  branch: string;
  message: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
  expiresAt: number;
}

export interface DelegationSubtask {
  subtaskId: string;
  description: string;
  assignedTo: string;
  status: "pending" | "accepted" | "rejected" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
  dependencies: string[];
  rejectionReason?: string;
  completedAt?: number;
  acceptedAt?: number;
  notes?: string;
}

export interface DelegationPlan {
  planId: string;
  goal: string;
  createdBy: string;
  createdAt: number;
  status: "active" | "completed" | "cancelled";
  subtasks: DelegationSubtask[];
}
