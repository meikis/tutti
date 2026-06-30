import assert from "node:assert/strict";
import test from "node:test";
import type { NotificationMessage } from "@tutti-os/ui-notifications";
import {
  buildWorkspaceAgentOutcomeNotificationFromSessionEvent,
  createWorkspaceAgentOutcomeNotificationController
} from "./workspaceAgentOutcomeNotification.ts";

test("outcome notification builder reports completed turn state patches as success", () => {
  assert.deepEqual(
    buildWorkspaceAgentOutcomeNotificationFromSessionEvent(
      statePatchEvent({ outcome: "success" })
    ),
    {
      agentSessionId: "session-1",
      conversationTitle: "Build feature",
      level: "success",
      provider: "codex",
      status: "completed",
      workspaceId: "ws-1"
    }
  );
});

test("outcome notification builder reports failed turn state patches as error", () => {
  assert.deepEqual(
    buildWorkspaceAgentOutcomeNotificationFromSessionEvent(
      statePatchEvent({ outcome: "failed" })
    ),
    {
      agentSessionId: "session-1",
      conversationTitle: "Build feature",
      level: "error",
      provider: "codex",
      status: "failed",
      workspaceId: "ws-1"
    }
  );
});

test("outcome notification builder ignores message updates", () => {
  assert.equal(
    buildWorkspaceAgentOutcomeNotificationFromSessionEvent({
      eventType: "message_update",
      data: {
        workspaceId: "ws-1",
        agentSessionId: "session-1",
        messages: [
          {
            role: "assistant",
            status: "completed",
            turnId: "turn-1"
          }
        ]
      }
    }),
    null
  );
});

test("outcome notification builder ignores state patches without stable turn outcome", () => {
  assert.equal(
    buildWorkspaceAgentOutcomeNotificationFromSessionEvent(
      statePatchEvent({ outcome: "canceled" })
    ),
    null
  );
  assert.equal(
    buildWorkspaceAgentOutcomeNotificationFromSessionEvent(
      statePatchEvent({ outcome: "success", turnId: "" })
    ),
    null
  );
  assert.equal(
    buildWorkspaceAgentOutcomeNotificationFromSessionEvent({
      eventType: "state_patch",
      data: {
        workspaceId: "ws-1",
        agentSessionId: "session-1",
        lifecycleStatus: "failed",
        provider: "codex",
        title: "Build feature"
      }
    }),
    null
  );
});

test("outcome notification controller notifies from live session events", () => {
  const events: Array<(event: unknown) => void> = [];
  const foregroundNotifications: unknown[] = [];
  const notifications: NotificationMessage[] = [];
  const controller = createWorkspaceAgentOutcomeNotificationController({
    foreground: {
      show(notification) {
        foregroundNotifications.push(notification);
      }
    },
    notifications: {
      notify(message) {
        notifications.push(message);
      }
    },
    translate(key, params) {
      if (key.endsWith("CompletedBody")) {
        return "The agent finished this run.";
      }
      if (key.endsWith("CompletedTitle")) {
        return `${params?.title} completed`;
      }
      if (key.endsWith("CompletedStatus")) {
        return "Completed";
      }
      if (key === "workspace.agentGui.fallbackAgentLabel") {
        return "Agent";
      }
      if (key === "common.close") {
        return "Close";
      }
      return key;
    },
    workspaceAgentActivityService: {
      onSessionEvent(workspaceId, listener) {
        assert.equal(workspaceId, "ws-1");
        events.push(listener);
        return () => {
          const index = events.indexOf(listener);
          if (index >= 0) {
            events.splice(index, 1);
          }
        };
      }
    },
    workspaceId: "ws-1"
  });

  events[0]?.(statePatchEvent({ outcome: "success" }));

  assert.deepEqual(foregroundNotifications, [
    {
      agentName: "Codex",
      agentSessionId: "session-1",
      body: "The agent finished this run.",
      closeLabel: "Close",
      conversationTitle: "Build feature",
      level: "success",
      provider: "codex",
      statusLabel: "Completed",
      workspaceId: "ws-1"
    }
  ]);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], {
    description: "The agent finished this run.",
    level: "success",
    navigation: {
      agentSessionId: "session-1",
      provider: "codex",
      workspaceId: "ws-1"
    },
    presentation: "background-only",
    title: "Build feature completed"
  });

  controller.dispose();
  assert.equal(events.length, 0);
});

function statePatchEvent(input: { outcome: string; turnId?: string }): unknown {
  return {
    eventType: "state_patch",
    data: {
      workspaceId: "ws-1",
      agentSessionId: "session-1",
      provider: "codex",
      title: "Build feature",
      turn: {
        turnId: input.turnId ?? "turn-1",
        outcome: input.outcome
      }
    }
  };
}
