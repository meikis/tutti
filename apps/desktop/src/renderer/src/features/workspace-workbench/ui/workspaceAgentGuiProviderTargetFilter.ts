import type { AgentGUIProviderTarget } from "@tutti-os/agent-gui";
import { resolveAgentGUIProviderCatalogIdentity } from "@tutti-os/agent-gui/provider-catalog";

export function filterWorkspaceAgentGuiProviderTargets(
  targets: readonly AgentGUIProviderTarget[],
  input: { tuttiAgentSwitchEnabled: boolean }
): readonly AgentGUIProviderTarget[] {
  if (input.tuttiAgentSwitchEnabled) {
    return targets;
  }
  return targets.map((target) =>
    resolveAgentGUIProviderCatalogIdentity(target.provider)?.desktop
      .visibilityGate === "tutti_agent"
      ? { ...target, disabled: true }
      : target
  );
}
