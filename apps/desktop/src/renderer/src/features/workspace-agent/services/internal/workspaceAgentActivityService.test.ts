import assert from "node:assert/strict";
import test from "node:test";
import type { TuttidClient } from "@tutti-os/client-tuttid-ts";
import { WorkspaceAgentActivityService } from "./workspaceAgentActivityService.ts";

function createService(): WorkspaceAgentActivityService {
  return new WorkspaceAgentActivityService({
    tuttidClient: {} as TuttidClient,
    runtimeApi: {
      logTerminalDiagnostic: async () => {}
    }
  });
}

test("WorkspaceAgentActivityService.submitPlanDecision runs planMode-off then sendInput for a codex implement decision", async () => {
  const service = createService();

  const updateSettingsCalls: unknown[] = [];
  const sendInputCalls: unknown[] = [];
  const submitInteractiveCalls: unknown[] = [];

  service.updateSessionSettings = async (input) => {
    updateSettingsCalls.push(input);
    return { agentSessionId: input.agentSessionId, settings: {} };
  };
  service.sendInput = async (input) => {
    sendInputCalls.push(input);
    return {} as never;
  };
  service.submitInteractive = async (input) => {
    submitInteractiveCalls.push(input);
    return undefined;
  };

  await service.submitPlanDecision({
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    promptKind: "plan-implementation",
    action: "implement",
    requestId: "turn-1"
  });

  assert.equal(updateSettingsCalls.length, 1);
  assert.deepEqual(updateSettingsCalls[0], {
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    settings: { planMode: false }
  });

  assert.equal(sendInputCalls.length, 1);
  assert.deepEqual(sendInputCalls[0], {
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    content: [{ type: "text", text: "Implement the plan." }]
  });

  assert.equal(submitInteractiveCalls.length, 0);
});

test("WorkspaceAgentActivityService.submitPlanDecision routes a claude exit-plan decision through submitInteractive", async () => {
  const service = createService();

  const submitInteractiveCalls: unknown[] = [];

  service.updateSessionSettings = async () => {
    throw new Error("updateSessionSettings should not be called");
  };
  service.sendInput = async () => {
    throw new Error("sendInput should not be called");
  };
  service.submitInteractive = async (input) => {
    submitInteractiveCalls.push(input);
    return undefined;
  };

  await service.submitPlanDecision({
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    promptKind: "exit-plan",
    action: "allow",
    optionId: "acceptEdits",
    requestId: "req-1"
  });

  assert.equal(submitInteractiveCalls.length, 1);
  assert.deepEqual(submitInteractiveCalls[0], {
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    requestId: "req-1",
    action: "allow",
    optionId: "acceptEdits"
  });
});
