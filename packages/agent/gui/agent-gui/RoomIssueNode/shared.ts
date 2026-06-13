import { translate, type TranslateFn } from "../../i18n/index";
import { workspaceAgentActivityStatusLabel } from "../../shared/workspaceAgentActivityStatusLabel";
import { roomIssueStatusLabel } from "../../shared/roomIssueStatusLabel";
import { formatUnixTimestampAsLocalShortDateTime } from "../../app/renderer/shell/utils/format";
import {
  appendWorkspaceFileLinksToContent,
  extractPlainTextFromContent,
  removeWorkspaceFileLinkFromContent
} from "../../shared/richText/richTextDocument";
import {
  resolveWorkspaceAgentActivityStatus,
  type WorkspaceAgentActivityStatus
} from "../../shared/workspaceAgentActivityListViewModel";
import type {
  AgentHostManageAgentActionKind,
  AgentHostManagedAgentsState,
  AgentHostRoomIssueSummary,
  AgentHostRoomTaskStatusCounts,
  AgentHostRoomTaskSummary,
  AgentHostRoomIssueOrigin
} from "../../shared/contracts/dto";
import { TSH_DESKTOP_PRIMARY_EXECUTION_ISSUE_ID_PREFIX } from "../../shared/contracts/dto";
import {
  getAgentHostManagedToolchainAgentActionAgentId,
  getAgentHostManagedToolchainAgentById,
  resolveAgentHostManagedAgentsStateItem,
  resolveAgentHostManagedToolchainAction,
  AGENT_HOST_MANAGED_TOOLCHAIN_AGENTS
} from "../../shared/utils/managedToolchainAgents";
import { filterToolchainAgentsForManageAgents } from "../../shared/featureFlags/manageAgentsVisibleToolchainAgents";
import type { RoomIssueNodeData } from "../../types";
import type { WorkspaceAgentActivitySession } from "../../shared/workspaceAgentActivityTypes";
import styles from "./RoomIssueNode.styles";

export const TASK_PAGE_SIZE = 25;
export const WORKSPACE_TREE_REFRESH_DEPTH = 8;
export const LOGICAL_WORKSPACE_ROOT = "/workspace";
export const INTERACTIVE_TARGET_SELECTOR =
  'button, input, textarea, select, option, a, [role="button"], [role="link"], .nodrag';

export const ISSUE_ROW_ACTIONS_MENU_SELECTOR = "[data-issue-row-actions-menu]";

export function isIssueRowActionsMenuPointerTarget(
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(ISSUE_ROW_ACTIONS_MENU_SELECTOR));
}

export type BusyAction =
  | "load-tasks"
  | "load-task-detail"
  | "load-issue-detail"
  | "save-task"
  | "delete-task"
  | "save-issue"
  | "delete-issue"
  | "run-issue"
  | "share-issue";

export type PendingDeleteTarget =
  | { kind: "task"; taskId: string; title: string }
  | { kind: "issue"; taskId: string; issueId: string; title: string };

export type IssueStatusValue = RoomIssueNodeData["issueDraft"]["status"];
export type TaskStatusFilterValue = RoomIssueNodeData["taskStatusFilter"];
export type SelectedProvider = RoomIssueNodeData["selectedProvider"];
export type IssueAgentOption = {
  provider: SelectedProvider;
  label: string;
  managedAgentId: "codex" | "claude-code" | "tutti" | "openclaw" | "hermes";
};
export type RoomIssueProviderOption = IssueAgentOption & {
  action: "installed" | "sync" | "install";
  actionAgentId: string;
  disabled: boolean;
  reason: string;
  installAction: AgentHostManageAgentActionKind | null;
  installLabel: string | null;
  isRunnable: boolean;
};

function isIssueAgentOptionId(
  id: string
): id is IssueAgentOption["managedAgentId"] {
  return (
    id === "codex" ||
    id === "claude-code" ||
    id === "tutti" ||
    id === "openclaw" ||
    id === "hermes"
  );
}

const ACTIVITY_STATUS_WORKING: WorkspaceAgentActivityStatus = "working";
const ACTIVITY_STATUS_COMPLETED: WorkspaceAgentActivityStatus = "completed";
const ACTIVITY_STATUS_FAILED: WorkspaceAgentActivityStatus = "failed";
const ACTIVITY_STATUS_IDLE: WorkspaceAgentActivityStatus = "idle";

export const DEFAULT_ROOM_ISSUE_NODE_DATA: RoomIssueNodeData = {
  sizeMode: "standard",
  selectedTaskId: null,
  selectedIssueId: null,
  taskStatusFilter: "all",
  taskSearchQuery: "",
  taskListNextPageToken: null,
  issueListNextPageToken: null,
  selectedProvider: "codex",
  taskEditing: false,
  issueEditing: false,
  taskDraft: {
    taskId: null,
    title: "",
    content: ""
  },
  issueDraft: {
    issueId: null,
    title: "",
    content: "",
    status: "not_started"
  }
};

export const DEFAULT_TASK_STATUS_COUNTS: AgentHostRoomTaskStatusCounts = {
  all: 0,
  notStarted: 0,
  running: 0,
  pendingAcceptance: 0,
  completed: 0,
  failed: 0,
  canceled: 0
};

export const STATUS_TABS: Array<{
  value: TaskStatusFilterValue;
  labelKey: string;
  countKey: keyof AgentHostRoomTaskStatusCounts;
}> = [
  {
    value: "all",
    labelKey: "agentHost.roomIssueNode.statusTabAll",
    countKey: "all"
  },
  {
    value: "not_started",
    labelKey: "agentHost.roomIssueNode.statusTabNotStarted",
    countKey: "notStarted"
  },
  {
    value: "running",
    labelKey: "agentHost.roomIssueNode.statusTabRunning",
    countKey: "running"
  },
  {
    value: "pending_acceptance",
    labelKey: "agentHost.roomIssueNode.statusTabPendingAcceptance",
    countKey: "pendingAcceptance"
  },
  {
    value: "completed",
    labelKey: "agentHost.roomIssueNode.statusTabCompleted",
    countKey: "completed"
  }
];

export const ISSUE_STATUS_VALUES: IssueStatusValue[] = [
  "not_started",
  "running",
  "pending_acceptance",
  "completed",
  "failed",
  "canceled"
];

export function createEmptyContent(): string {
  return "";
}

export function createUuid(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

export function createPrefixedUuid(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return `${prefix}-${suffix}`;
}

export function resolveIssueOrigin(
  issue: Pick<AgentHostRoomIssueSummary, "issueId" | "origin">
): AgentHostRoomIssueOrigin {
  const explicitOrigin = issue.origin?.trim();
  if (explicitOrigin) {
    return explicitOrigin;
  }
  return issue.issueId.startsWith(
    `${TSH_DESKTOP_PRIMARY_EXECUTION_ISSUE_ID_PREFIX}-`
  )
    ? "primary_task_execution"
    : "manual";
}

export function isPrimaryExecutionIssue(
  issue: Pick<AgentHostRoomIssueSummary, "issueId" | "origin">
): boolean {
  return resolveIssueOrigin(issue) === "primary_task_execution";
}

export function basename(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

export function formatTimestamp(unix?: number): string {
  return formatUnixTimestampAsLocalShortDateTime(unix);
}

export function resolveRoomIssueMemberLabel(input: {
  userId?: string | null;
  displayName?: string | null;
  currentUserId?: string | null;
  memberLabelsByUserId?: Record<string, string>;
}): string {
  const displayName = input.displayName?.trim() ?? "";
  if (displayName) {
    return displayName;
  }
  const userId = input.userId?.trim() ?? "";
  if (!userId) {
    return input.currentUserId?.trim() || "—";
  }

  const memberLabel = input.memberLabelsByUserId?.[userId]?.trim();
  return memberLabel || userId;
}

export function summarizeContent(
  content?: string | null,
  t?: TranslateFn
): string {
  const text = extractPlainTextFromContent(content).trim();
  return text.length > 0
    ? text
    : t
      ? t("agentHost.roomIssueNode.emptyContent")
      : translate("agentHost.roomIssueNode.emptyContent");
}

export function getRoomIssueAgentOptions(
  t: TranslateFn
): readonly IssueAgentOption[] {
  const providerByManagedAgentId: Record<
    IssueAgentOption["managedAgentId"],
    IssueAgentOption
  > = {
    "claude-code": {
      provider: "claude-code",
      label: t("agentHost.issue.agentClaudeCode"),
      managedAgentId: "claude-code"
    },
    codex: {
      provider: "codex",
      label: t("agentHost.issue.agentCodex"),
      managedAgentId: "codex"
    },
    tutti: {
      provider: "nexight",
      label: t("agentHost.issue.agentTutti"),
      managedAgentId: "tutti"
    },
    hermes: {
      provider: "hermes",
      label: t("agentHost.issue.agentHermes"),
      managedAgentId: "hermes"
    },
    openclaw: {
      provider: "openclaw",
      label: t("agentHost.issue.agentOpenClaw"),
      managedAgentId: "openclaw"
    }
  };

  return filterToolchainAgentsForManageAgents(
    AGENT_HOST_MANAGED_TOOLCHAIN_AGENTS
  )
    .map((agent) =>
      isIssueAgentOptionId(agent.id)
        ? providerByManagedAgentId[agent.id]
        : undefined
    )
    .filter((option): option is IssueAgentOption => option !== undefined);
}

export function buildRoomIssueProviderOptions({
  managedAgentsState,
  pendingAgentActionId,
  queuedAgentActionIds = [],
  t
}: {
  managedAgentsState: AgentHostManagedAgentsState | null;
  pendingAgentActionId: string | null;
  queuedAgentActionIds?: readonly string[];
  t: TranslateFn;
}): RoomIssueProviderOption[] {
  return getRoomIssueAgentOptions(t)
    .map((option, index) => {
      const managedAgent = getAgentHostManagedToolchainAgentById(
        option.managedAgentId
      );
      const reviewItem = managedAgent
        ? resolveAgentHostManagedAgentsStateItem(
            managedAgent,
            managedAgentsState
          )
        : undefined;
      const action = managedAgent
        ? resolveAgentHostManagedToolchainAction(
            managedAgent,
            reviewItem,
            managedAgentsState
          )
        : "install";
      const actionAgentId = managedAgent
        ? getAgentHostManagedToolchainAgentActionAgentId(managedAgent)
        : option.provider;
      const isPending =
        pendingAgentActionId === actionAgentId ||
        queuedAgentActionIds.includes(actionAgentId);
      const installAction =
        action === "install" || action === "sync" ? action : null;
      const reason =
        installAction !== null ? reviewItem?.decisionReason?.trim() || "" : "";
      const isRunnable = action === "installed";
      const disabled = isPending;
      const installLabel =
        installAction === "install"
          ? isPending
            ? t("agentHost.issue.installing")
            : t("agentHost.issue.install")
          : installAction === "sync"
            ? isPending
              ? t("agentHost.issue.syncing")
              : t("agentHost.issue.sync")
            : null;

      return {
        ...option,
        action,
        actionAgentId,
        disabled,
        reason,
        installAction,
        installLabel,
        isRunnable,
        index
      };
    })
    .sort((left, right) => {
      const leftRank = left.isRunnable ? 0 : left.installAction ? 1 : 2;
      const rightRank = right.isRunnable ? 0 : right.installAction ? 1 : 2;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.index - right.index;
    })
    .map(({ index: _index, ...option }) => option);
}

export function toLogicalWorkspacePath(
  workspacePath: string,
  requestedPath: string
): string {
  const normalizedWorkspacePath = workspacePath.trim().replace(/\/+$/, "");
  const normalizedRequestedPath = requestedPath.trim().replace(/\/+$/, "");

  if (!normalizedRequestedPath) {
    return normalizedRequestedPath;
  }

  if (
    normalizedRequestedPath === LOGICAL_WORKSPACE_ROOT ||
    normalizedRequestedPath.startsWith(`${LOGICAL_WORKSPACE_ROOT}/`)
  ) {
    return normalizedRequestedPath;
  }

  if (
    normalizedWorkspacePath &&
    (normalizedRequestedPath === normalizedWorkspacePath ||
      normalizedRequestedPath.startsWith(`${normalizedWorkspacePath}/`))
  ) {
    const suffix = normalizedRequestedPath
      .slice(normalizedWorkspacePath.length)
      .replace(/^\/+/, "");
    return suffix.length > 0
      ? `${LOGICAL_WORKSPACE_ROOT}/${suffix}`
      : LOGICAL_WORKSPACE_ROOT;
  }

  if (!normalizedRequestedPath.startsWith("/")) {
    return `${LOGICAL_WORKSPACE_ROOT}/${normalizedRequestedPath.replace(/^\/+/, "")}`;
  }

  return normalizedRequestedPath;
}

export function relativeWorkspacePath(
  workspacePath: string,
  path: string
): string {
  const normalizedWorkspacePath = workspacePath.trim().replace(/\/+$/, "");
  const normalizedPath = path.trim().replace(/\/+$/, "");
  if (!normalizedPath) {
    return "";
  }
  if (
    normalizedWorkspacePath &&
    normalizedPath.startsWith(`${normalizedWorkspacePath}/`)
  ) {
    return normalizedPath.slice(normalizedWorkspacePath.length + 1);
  }
  if (normalizedPath === normalizedWorkspacePath) {
    return "";
  }
  if (normalizedPath === LOGICAL_WORKSPACE_ROOT) {
    return "";
  }
  if (normalizedPath.startsWith(`${LOGICAL_WORKSPACE_ROOT}/`)) {
    return normalizedPath.slice(`${LOGICAL_WORKSPACE_ROOT}/`.length);
  }
  return normalizedPath.replace(/^\/+/, "");
}

export function displayWorkspacePath(
  workspacePath: string,
  path: string
): string {
  const relative = relativeWorkspacePath(workspacePath, path);
  return relative.length > 0 ? relative : "/";
}

export function buildTransferredWorkspacePaths(
  targetDirectoryPath: string,
  sourcePaths: readonly string[]
): string[] {
  const normalizedTarget = targetDirectoryPath.trim().replace(/\/+$/, "");
  return sourcePaths.map(
    (sourcePath) => `${normalizedTarget}/${basename(sourcePath)}`
  );
}

export function replaceTaskDraftRefs(
  content: string,
  currentRefs: readonly { path: string }[],
  nextRefs: Array<{ path: string; name: string }>
): string {
  const contentWithoutRefs = currentRefs.reduce(
    (currentContent, ref) =>
      removeWorkspaceFileLinkFromContent(currentContent, ref.path),
    content
  );
  return nextRefs.length > 0
    ? appendWorkspaceFileLinksToContent(contentWithoutRefs, nextRefs)
    : contentWithoutRefs;
}

export function normalizeRoomIssueState(
  state?: RoomIssueNodeData | null
): RoomIssueNodeData {
  if (!state) {
    return DEFAULT_ROOM_ISSUE_NODE_DATA;
  }

  return {
    ...DEFAULT_ROOM_ISSUE_NODE_DATA,
    ...state,
    taskDraft: {
      ...DEFAULT_ROOM_ISSUE_NODE_DATA.taskDraft,
      ...state.taskDraft,
      content:
        state.taskDraft?.content ??
        DEFAULT_ROOM_ISSUE_NODE_DATA.taskDraft.content
    },
    issueDraft: {
      ...DEFAULT_ROOM_ISSUE_NODE_DATA.issueDraft,
      ...state.issueDraft,
      content:
        state.issueDraft?.content ??
        DEFAULT_ROOM_ISSUE_NODE_DATA.issueDraft.content
    }
  };
}

export function countLabel(
  task: AgentHostRoomTaskSummary,
  t?: TranslateFn
): string {
  const count = task.manualIssueCount ?? task.issueCount;
  return count > 0
    ? (t ?? translate)("agentHost.roomIssueNode.taskCount", { count })
    : (t ?? translate)("agentHost.roomIssueNode.taskCountEmpty");
}

export function issueCountSummary(
  task: AgentHostRoomTaskSummary,
  t?: TranslateFn
): string {
  const translateFn = t ?? translate;
  if (task.runningCount > 0) {
    return translateFn("agentHost.roomIssueNode.taskRunningCount", {
      count: task.runningCount
    });
  }
  if (task.pendingAcceptanceCount > 0) {
    return translateFn("agentHost.roomIssueNode.taskPendingAcceptanceCount", {
      count: task.pendingAcceptanceCount
    });
  }
  if (task.completedCount > 0) {
    return translateFn("agentHost.roomIssueNode.taskCompletedCount", {
      count: task.completedCount
    });
  }
  return countLabel(task, translateFn);
}

export function statusLabel(status: string, t?: TranslateFn): string {
  return roomIssueStatusLabel(status, t);
}

export function buildIssueStatusOptions(
  t: TranslateFn
): Array<{ value: IssueStatusValue; label: string }> {
  return ISSUE_STATUS_VALUES.map((value) => ({
    value,
    label: statusLabel(value, t)
  }));
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return styles.statusBadgeCompleted;
    case "running":
      return styles.statusBadgeRunning;
    case "pending_acceptance":
      return styles.statusBadgePending;
    case "failed":
      return styles.statusBadgeFailed;
    case "canceled":
      return styles.statusBadgeCanceled;
    default:
      return styles.statusBadgeDefault;
  }
}

export function resolveIssueStatusValue(
  value: string | undefined
): IssueStatusValue {
  return value === "running" ||
    value === "pending_acceptance" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
    ? value
    : "not_started";
}

export function runStatusLabel(status?: string, t?: TranslateFn): string {
  const translateFn = t ?? translate;
  switch (status?.trim().toLowerCase()) {
    case "running":
      return translateFn("agentHost.roomIssueNode.runStatusRunning");
    case "completed":
      return translateFn("agentHost.roomIssueNode.runStatusCompleted");
    case "failed":
      return translateFn("agentHost.roomIssueNode.runStatusFailed");
    case "canceled":
      return translateFn("agentHost.roomIssueNode.runStatusCanceled");
    default:
      return translateFn("agentHost.roomIssueNode.runStatusIdle");
  }
}

export function activityStatusFromRun(
  status?: string
): WorkspaceAgentActivityStatus {
  switch (status?.trim().toLowerCase()) {
    case "running":
      return ACTIVITY_STATUS_WORKING;
    case "completed":
      return ACTIVITY_STATUS_COMPLETED;
    case "failed":
      return ACTIVITY_STATUS_FAILED;
    case "canceled":
      return "canceled";
    default:
      return ACTIVITY_STATUS_IDLE;
  }
}

export function activityStatusLabel(
  status: WorkspaceAgentActivityStatus,
  t?: TranslateFn
): string {
  return workspaceAgentActivityStatusLabel(status, t);
}

export function resolveWorkspaceAgentSessionActivityStatus(input: {
  agentSessionId?: string | null;
  fallbackStatus: WorkspaceAgentActivityStatus;
  workspaceAgentSessions?: readonly WorkspaceAgentActivitySession[];
}): WorkspaceAgentActivityStatus {
  const targetSessionId = input.agentSessionId?.trim() ?? "";
  if (!targetSessionId) {
    return input.fallbackStatus;
  }
  const session = (input.workspaceAgentSessions ?? []).find((candidate) => {
    const agentSessionId = candidate.agentSessionId?.trim() ?? "";
    const providerSessionId = candidate.providerSessionId?.trim() ?? "";
    return (
      agentSessionId === targetSessionId ||
      providerSessionId === targetSessionId
    );
  });
  return session
    ? resolveWorkspaceAgentActivityStatus(session)
    : input.fallbackStatus;
}
