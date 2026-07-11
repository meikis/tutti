import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_CAPABILITY_KEYS,
  hasAgentCapability,
  resolveAgentActivityCapability
} from "./capabilities.ts";
import type { AgentActivityComposerOptions } from "./types.ts";

test("runtime capabilities take precedence over composer options", () => {
  assert.equal(
    resolveAgentActivityCapability("compact", {
      sessionCapabilities: { compact: false, interrupt: true },
      composerOptions: composerOptions({ capabilities: ["compact"] })
    }),
    false
  );
  assert.equal(
    resolveAgentActivityCapability("compact", {
      sessionCapabilities: { compact: true }
    }),
    true
  );
});

test("falls back to composer options when session has no capability list", () => {
  assert.equal(
    resolveAgentActivityCapability("skills", {
      composerOptions: composerOptions({ capabilities: ["skills"] })
    }),
    true
  );
});

test("returns null when no capability data exists", () => {
  assert.equal(resolveAgentActivityCapability("compact", {}), null);
});

test("checks one runtime capability without provider inference", () => {
  assert.equal(hasAgentCapability({ planMode: true }, "planMode"), true);
  assert.equal(hasAgentCapability({}, "planMode"), false);
});

test("imageInput resolves from the capabilities list only", () => {
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      sessionCapabilities: { imageInput: true }
    }),
    true
  );
  assert.equal(resolveAgentActivityCapability("imageInput", {}), null);
});

test("vocabulary matches the Go side", () => {
  assert.deepEqual([...AGENT_CAPABILITY_KEYS].sort(), [
    "browserUse",
    "compact",
    "computerUse",
    "goalPause",
    "imageInput",
    "interrupt",
    "modelImageInputRequired",
    "permissionModeChangeDeferred",
    "permissionModeChangeDuringTurn",
    "planImplementation",
    "planMode",
    "rateLimits",
    "resumeRunningTurn",
    "review",
    "skills",
    "tokenUsage"
  ]);
});

function composerOptions(
  runtimeContext: Record<string, unknown>
): AgentActivityComposerOptions {
  const capabilities = Array.isArray(runtimeContext.capabilities)
    ? runtimeContext.capabilities.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  return {
    provider: "codex",
    models: [],
    reasoningEfforts: [],
    speeds: [],
    permissionConfig: null,
    capabilityCatalog: capabilities.map((id) => ({
      id,
      invocation: "none",
      kind: "plugin",
      label: id,
      name: id,
      status: "available"
    })),
    skills: [],
    behavior: {
      collapseModelOptionsToLatest: false,
      modelOptionsAuthoritative: false,
      refreshModelOptionsAfterSettings: false,
      prewarmDraftSession: false,
      planModeExclusiveWithPermissionMode: false
    },
    loadedAtUnixMs: 1
  };
}
