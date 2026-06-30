import type { NotificationService } from "@tutti-os/ui-notifications";
import type { CompositeNotificationMessage } from "@renderer/lib/compositeNotificationService";
import type { DesktopI18nKey, I18nParams } from "@shared/i18n";
import type { IWorkspaceAgentActivityService } from "@renderer/features/workspace-agent";

export interface WorkspaceAgentOutcomeNotificationController {
  dispose(): void;
}

export interface WorkspaceAgentOutcomeNotification {
  agentSessionId: string;
  conversationTitle: string;
  level: "error" | "success";
  provider: string;
  status: "completed" | "failed";
  workspaceId: string;
}

export interface WorkspaceAgentOutcomeForegroundNotification {
  agentName: string;
  agentSessionId: string;
  body: string;
  closeLabel: string;
  conversationTitle: string;
  level: "error" | "success";
  provider: string;
  statusLabel: string;
  workspaceId: string;
}

export interface WorkspaceAgentOutcomeForegroundNotificationPresenter {
  show(notification: WorkspaceAgentOutcomeForegroundNotification): void;
}

export interface WorkspaceAgentOutcomeNotificationControllerInput {
  foreground?: WorkspaceAgentOutcomeForegroundNotificationPresenter;
  notifications: Pick<NotificationService, "notify">;
  translate(key: DesktopI18nKey, params?: I18nParams): string;
  workspaceAgentActivityService: Pick<
    IWorkspaceAgentActivityService,
    "onSessionEvent"
  >;
  workspaceId: string;
}

export function createWorkspaceAgentOutcomeNotificationController(
  input: WorkspaceAgentOutcomeNotificationControllerInput
): WorkspaceAgentOutcomeNotificationController {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    return { dispose() {} };
  }

  const unsubscribe = input.workspaceAgentActivityService.onSessionEvent(
    workspaceId,
    (event) => {
      const notification =
        buildWorkspaceAgentOutcomeNotificationFromSessionEvent(event);
      if (!notification) {
        return;
      }
      input.foreground?.show(
        workspaceAgentOutcomeForegroundNotification(
          notification,
          input.translate
        )
      );
      input.notifications.notify(
        workspaceAgentOutcomeNotificationMessage(notification, input.translate)
      );
    }
  );

  return {
    dispose() {
      unsubscribe();
    }
  };
}

export function buildWorkspaceAgentOutcomeNotificationFromSessionEvent(
  event: unknown
): WorkspaceAgentOutcomeNotification | null {
  const source = recordValue(event);
  if (stringValue(source?.eventType) !== "state_patch") {
    return null;
  }
  const data = recordValue(source?.data);
  const turn = recordValue(data?.turn);
  const status = outcomeStatusFromTurnOutcome(stringValue(turn?.outcome));
  const turnId = stringValue(turn?.turnId);
  if (!data || !turn || !status || !turnId) {
    return null;
  }
  const workspaceId = stringValue(data.workspaceId);
  const agentSessionId = stringValue(data.agentSessionId);
  const provider = stringValue(data.provider);
  if (!workspaceId || !agentSessionId || !provider) {
    return null;
  }
  return {
    agentSessionId,
    conversationTitle: stringValue(data.title),
    level: status === "completed" ? "success" : "error",
    provider,
    status,
    workspaceId
  };
}

function workspaceAgentOutcomeNotificationMessage(
  notification: WorkspaceAgentOutcomeNotification,
  translate: WorkspaceAgentOutcomeNotificationControllerInput["translate"]
): CompositeNotificationMessage {
  const titleFallback =
    notification.conversationTitle ||
    formatWorkspaceAgentProviderName(notification.provider);
  return {
    description: translate(
      notification.status === "completed"
        ? "workspace.agentMessageCenter.outcomeNotificationCompletedBody"
        : "workspace.agentMessageCenter.outcomeNotificationFailedBody"
    ),
    level: notification.level,
    navigation: {
      agentSessionId: notification.agentSessionId,
      provider: notification.provider,
      workspaceId: notification.workspaceId
    },
    presentation: "background-only",
    title: translate(
      notification.status === "completed"
        ? "workspace.agentMessageCenter.outcomeNotificationCompletedTitle"
        : "workspace.agentMessageCenter.outcomeNotificationFailedTitle",
      {
        title:
          titleFallback || translate("workspace.agentGui.fallbackAgentLabel")
      }
    )
  };
}

function workspaceAgentOutcomeForegroundNotification(
  notification: WorkspaceAgentOutcomeNotification,
  translate: WorkspaceAgentOutcomeNotificationControllerInput["translate"]
): WorkspaceAgentOutcomeForegroundNotification {
  const agentName =
    formatWorkspaceAgentProviderName(notification.provider) ||
    translate("workspace.agentGui.fallbackAgentLabel");
  return {
    agentName,
    agentSessionId: notification.agentSessionId,
    body: translate(
      notification.status === "completed"
        ? "workspace.agentMessageCenter.outcomeNotificationCompletedBody"
        : "workspace.agentMessageCenter.outcomeNotificationFailedBody"
    ),
    closeLabel: translate("common.close"),
    conversationTitle: notification.conversationTitle,
    level: notification.level,
    provider: notification.provider,
    statusLabel: translate(
      notification.status === "completed"
        ? "workspace.agentMessageCenter.outcomeNotificationCompletedStatus"
        : "workspace.agentMessageCenter.outcomeNotificationFailedStatus"
    ),
    workspaceId: notification.workspaceId
  };
}

function outcomeStatusFromTurnOutcome(
  outcome: string
): WorkspaceAgentOutcomeNotification["status"] | null {
  switch (outcome.trim().toLowerCase()) {
    case "completed":
    case "done":
    case "success":
    case "succeeded":
      return "completed";
    case "error":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function formatWorkspaceAgentProviderName(provider: string): string {
  return provider
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
