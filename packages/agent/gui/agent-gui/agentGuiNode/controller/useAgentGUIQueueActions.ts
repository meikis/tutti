import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import {
  selectEnginePromptQueue,
  selectEngineQueuedPrompt,
  selectEngineSubmitAvailability,
  type AgentSessionEngine
} from "@tutti-os/agent-activity-core";
import type { AgentActivityRuntime } from "../../../agentActivityRuntime";
import type { AgentComposerDraft } from "../model/agentGuiNodeTypes";
import { agentPromptContentToComposerDraft } from "../model/agentComposerDraft";
import { resolveAgentComposerDraftScopeKey } from "../model/agentComposerDraftScope";
import { createAgentGUIConversationId } from "./agentGuiController.promptHelpers";
import { reportAgentGUIQueueSendNowDiagnostic } from "./agentGuiController.reporting";

export interface UseAgentGUIQueueActionsInput {
  activeConversationIdRef: RefObject<string | null>;
  agentActivityRuntime: AgentActivityRuntime;
  previewMode: boolean;
  sessionEngine: AgentSessionEngine;
  setDraftByScopeKey: Dispatch<
    SetStateAction<Record<string, AgentComposerDraft>>
  >;
  workspaceId: string;
}

/** Owns queued-prompt mutations without coupling them to session activation. */
export function useAgentGUIQueueActions({
  activeConversationIdRef,
  agentActivityRuntime,
  previewMode,
  sessionEngine,
  setDraftByScopeKey,
  workspaceId
}: UseAgentGUIQueueActionsInput) {
  const removeQueuedPrompt = useCallback(
    (queuedPromptId: string) => {
      if (previewMode) {
        return;
      }
      const agentSessionId = activeConversationIdRef.current;
      const normalizedQueuedPromptId = queuedPromptId.trim();
      if (!agentSessionId || !normalizedQueuedPromptId) {
        return;
      }
      const queuedPrompt = selectEngineQueuedPrompt(
        sessionEngine.getSnapshot(),
        agentSessionId,
        normalizedQueuedPromptId
      );
      sessionEngine.dispatch(
        queuedPrompt?.clientSubmitId
          ? {
              agentSessionId,
              clientSubmitId: queuedPrompt.clientSubmitId,
              type: "submit/canceled"
            }
          : {
              agentSessionId,
              promptId: normalizedQueuedPromptId,
              type: "queue/removed"
            }
      );
    },
    [activeConversationIdRef, previewMode, sessionEngine]
  );

  const editQueuedPrompt = useCallback(
    (queuedPromptId: string) => {
      const agentSessionId = activeConversationIdRef.current;
      const normalizedQueuedPromptId = queuedPromptId.trim();
      if (previewMode || !agentSessionId || !normalizedQueuedPromptId) {
        return;
      }
      const queuedPrompt = selectEngineQueuedPrompt(
        sessionEngine.getSnapshot(),
        agentSessionId,
        normalizedQueuedPromptId
      );
      if (!queuedPrompt) {
        return;
      }
      sessionEngine.dispatch(
        queuedPrompt.clientSubmitId
          ? {
              agentSessionId,
              clientSubmitId: queuedPrompt.clientSubmitId,
              type: "submit/canceled"
            }
          : {
              agentSessionId,
              promptId: normalizedQueuedPromptId,
              type: "queue/removed"
            }
      );
      setDraftByScopeKey((current) => ({
        ...current,
        [resolveAgentComposerDraftScopeKey({ agentSessionId })]:
          agentPromptContentToComposerDraft(
            queuedPrompt.content,
            `restore-${queuedPrompt.id}`
          )
      }));
    },
    [activeConversationIdRef, previewMode, sessionEngine, setDraftByScopeKey]
  );

  const sendQueuedPromptNext = useCallback(
    (queuedPromptId: string) => {
      const agentSessionId = activeConversationIdRef.current;
      const normalizedQueuedPromptId = queuedPromptId.trim();
      if (previewMode || !agentSessionId || !normalizedQueuedPromptId) {
        return;
      }
      const snapshotBefore = sessionEngine.getSnapshot();
      const recordBefore = selectEnginePromptQueue(
        snapshotBefore,
        agentSessionId
      );
      const promptBefore = selectEngineQueuedPrompt(
        snapshotBefore,
        agentSessionId,
        normalizedQueuedPromptId
      );
      reportAgentGUIQueueSendNowDiagnostic({
        event: "agent.gui.queue.send_now.requested",
        runtime: agentActivityRuntime,
        workspaceId,
        details: {
          agentSessionId,
          promptId: normalizedQueuedPromptId,
          clientSubmitId: promptBefore?.clientSubmitId ?? null,
          availability: selectEngineSubmitAvailability(
            snapshotBefore,
            agentSessionId
          ),
          promptFoundInQueue: promptBefore !== null,
          promptGuidanceBefore: promptBefore?.guidance ?? false,
          promptIndexBefore:
            recordBefore?.prompts.findIndex(
              (prompt) => prompt.id === normalizedQueuedPromptId
            ) ?? -1,
          queueLengthBefore: recordBefore?.prompts.length ?? 0,
          inFlightPromptIdBefore: recordBefore?.inFlight?.promptId ?? null,
          failedPromptIdBefore: recordBefore?.failedPromptId ?? null,
          suspendReasonBefore: recordBefore?.suspendReason ?? null
        }
      });
      sessionEngine.dispatch({
        agentSessionId,
        awaitingTurnExpiresAtUnixMs: Date.now() + 30_000,
        cancelCommandId: createAgentGUIConversationId(),
        promptId: normalizedQueuedPromptId,
        timeoutMs: 30_000,
        type: "queue/sendNowRequested"
      });
      const snapshotAfter = sessionEngine.getSnapshot();
      const recordAfter = selectEnginePromptQueue(
        snapshotAfter,
        agentSessionId
      );
      const promptAfter = selectEngineQueuedPrompt(
        snapshotAfter,
        agentSessionId,
        normalizedQueuedPromptId
      );
      reportAgentGUIQueueSendNowDiagnostic({
        event: "agent.gui.queue.send_now.dispatched",
        runtime: agentActivityRuntime,
        workspaceId,
        details: {
          agentSessionId,
          promptId: normalizedQueuedPromptId,
          clientSubmitId: promptAfter?.clientSubmitId ?? null,
          availability: selectEngineSubmitAvailability(
            snapshotAfter,
            agentSessionId
          ),
          promptFoundInQueueAfter: promptAfter !== null,
          promptGuidanceAfter: promptAfter?.guidance ?? false,
          promptIndexAfter:
            recordAfter?.prompts.findIndex(
              (prompt) => prompt.id === normalizedQueuedPromptId
            ) ?? -1,
          queueLengthAfter: recordAfter?.prompts.length ?? 0,
          inFlightPromptIdAfter: recordAfter?.inFlight?.promptId ?? null,
          failedPromptIdAfter: recordAfter?.failedPromptId ?? null,
          suspendReasonAfter: recordAfter?.suspendReason ?? null
        }
      });
    },
    [
      activeConversationIdRef,
      agentActivityRuntime,
      previewMode,
      sessionEngine,
      workspaceId
    ]
  );

  return {
    editQueuedPrompt,
    removeQueuedPrompt,
    sendQueuedPromptNext
  };
}
