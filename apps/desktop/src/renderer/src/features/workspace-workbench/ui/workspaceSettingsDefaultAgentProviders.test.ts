import assert from "node:assert/strict";
import test from "node:test";
import { migratedAgentGUIProviderIdentityCatalog } from "@tutti-os/agent-gui/provider-catalog";
import {
  normalizeWorkspaceSettingsDefaultAgentProvider,
  workspaceSettingsDefaultAgentProviders
} from "./workspaceSettingsDefaultAgentProviders.ts";

test("derives workspace settings default providers in registry priority order", () => {
  const expected = migratedAgentGUIProviderIdentityCatalog
    .filter((entry) => entry.desktop.defaultProviderEligible)
    .slice()
    .sort(
      (left, right) =>
        left.desktop.defaultProviderPriority -
        right.desktop.defaultProviderPriority
    )
    .map((entry) => entry.providerId);

  assert.deepEqual(workspaceSettingsDefaultAgentProviders, expected);
});

test("normalizes an ineligible provider to the highest-priority default", () => {
  assert.equal(
    normalizeWorkspaceSettingsDefaultAgentProvider("cursor"),
    workspaceSettingsDefaultAgentProviders[0]
  );
});
