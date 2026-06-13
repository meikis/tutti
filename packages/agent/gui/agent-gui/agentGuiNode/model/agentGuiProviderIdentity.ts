import { AGENT_PROVIDER_LABEL } from "../../../contexts/settings/domain/agentSettings";
import { normalizeAgentTitleText } from "../../../shared/utils/agentTitleText";
import type { AgentGUIProvider } from "../../../types";
import { isWorkspaceAgentUntitledTask } from "../../../shared/workspaceAgentLatestActivitySummary";
import type { WorkspaceAgentActivityTimelineItem } from "../../../shared/workspaceAgentActivityTypes";

export type AgentGUIResolvedProvider = AgentGUIProvider | "unknown";
export type AgentGUIConversationTitleFallback = "generic-agent" | null;

export function normalizeAgentGUIProviderIdentity(
  provider: string | null | undefined
): AgentGUIResolvedProvider {
  switch (provider?.trim().toLowerCase() ?? "") {
    case "claude-code":
    case "claude":
    case "claude code":
      return "claude-code";
    case "codex":
      return "codex";
    case "nexight":
    case "tutti":
      return "nexight";
    case "gemini":
      return "gemini";
    case "hermes":
      return "hermes";
    case "openclaw":
      return "openclaw";
    default:
      return "unknown";
  }
}

export function resolveAgentGUIProviderIdentity(input: {
  sessionProvider?: string | null;
  workspaceSessionProvider?: string | null;
  conversationProvider?: string | null;
  timelineItems?: readonly WorkspaceAgentActivityTimelineItem[];
}): AgentGUIResolvedProvider {
  const candidates = [
    input.sessionProvider,
    input.workspaceSessionProvider,
    input.conversationProvider,
    timelineProviderHint(input.timelineItems ?? [])
  ];
  for (const candidate of candidates) {
    const normalized = normalizeAgentGUIProviderIdentity(candidate);
    if (normalized !== "unknown") {
      return normalized;
    }
  }
  return "unknown";
}

export function resolveAgentGUIConversationTitle(
  title: string | null | undefined,
  provider: AgentGUIResolvedProvider
): {
  title: string;
  titleFallback: AgentGUIConversationTitleFallback;
} {
  const normalizedTitle = stripAgentGUITitleTrailingPeriod(
    normalizeAgentTitleText(title)
  );
  if (normalizedTitle) {
    return {
      title: normalizedTitle,
      titleFallback: null
    };
  }
  if (provider === "unknown") {
    return {
      title: "",
      titleFallback: "generic-agent"
    };
  }
  return {
    title: AGENT_PROVIDER_LABEL[provider],
    titleFallback: null
  };
}

export function resolveAgentGUIConversationDisplayTitle(
  input: {
    title: string;
    titleFallback?: AgentGUIConversationTitleFallback;
  },
  fallbackAgentLabel: string
): string {
  if (input.title) {
    return stripAgentGUITitleTrailingPeriod(
      normalizeAgentTitleText(input.title)
    );
  }
  if (input.titleFallback === "generic-agent") {
    return stripAgentGUITitleTrailingPeriod(fallbackAgentLabel);
  }
  return "";
}

export function resolveAgentGUIDockConversationTitle(input: {
  provider: AgentGUIResolvedProvider;
  title: string;
  titleFallback?: AgentGUIConversationTitleFallback;
}): string | null {
  return resolveAgentGUIExplicitConversationTitle(input);
}

export function resolveAgentGUIExplicitConversationTitle(input: {
  provider: AgentGUIResolvedProvider;
  title: string;
  titleFallback?: AgentGUIConversationTitleFallback;
}): string | null {
  if (input.titleFallback) {
    return null;
  }

  const title = stripAgentGUITitleTrailingPeriod(
    normalizeAgentTitleText(input.title)
  );
  if (!title) {
    return null;
  }
  if (isWorkspaceAgentUntitledTask(title)) {
    return null;
  }

  if (
    input.provider !== "unknown" &&
    title === AGENT_PROVIDER_LABEL[input.provider]
  ) {
    return null;
  }

  return title;
}

export function resolveAgentGUIProviderDisplayLabel(
  provider: string | null | undefined,
  fallbackAgentLabel: string
): string {
  const resolvedProvider = normalizeAgentGUIProviderIdentity(provider);
  if (resolvedProvider === "unknown") {
    return fallbackAgentLabel;
  }
  return AGENT_PROVIDER_LABEL[resolvedProvider];
}

function stripAgentGUITitleTrailingPeriod(title: string): string {
  return title
    .trimEnd()
    .replace(/[.。]+$/u, "")
    .trimEnd();
}

function timelineProviderHint(
  timelineItems: readonly WorkspaceAgentActivityTimelineItem[]
): string | null {
  for (const item of timelineItems) {
    if (isUserTimelineItem(item)) {
      continue;
    }
    const normalized = normalizeAgentGUIProviderIdentity(item.actorId);
    if (normalized !== "unknown") {
      return normalized;
    }
  }
  return null;
}

function isUserTimelineItem(item: WorkspaceAgentActivityTimelineItem): boolean {
  const role = item.role?.trim().toLowerCase();
  if (role === "user") {
    return true;
  }
  const actorType = item.actorType.trim().toLowerCase();
  if (actorType === "user") {
    return true;
  }
  return item.itemType.trim().toLowerCase() === "message.user";
}
