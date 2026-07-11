# @tutti-os/agent-gui

AgentGUI renders workspace agent sessions, timelines, approvals, and composer
UI. It is a UI package, not a host transport or business-core package.

Before changing AgentGUI, AgentGuiNode, or the agent conversation module, read
[AgentGuiNode Architecture and Troubleshooting](../../../docs/architecture/agent-gui-node.md).
It defines daemon, workspace-engine, GUI-module, provider, and desktop-host
ownership.

## Data Source

The injected workspace `AgentSessionEngine`, reached through
`AgentActivityRuntime`, is AgentGUI's only source for canonical agent activity
data.

Runtime-owned data includes:

- canonical sessions, turns, interactions, and operation state
- prompt queue and correlated optimistic intents
- stable selector projections
- semantic session, turn, prompt, interaction, settings, and goal commands

Host capabilities remain separate from activity data:

- workspace files and file references
- clipboard
- account/user lookup
- user-project selection
- local file picking/reading and batch export helpers

AgentGUI has no host-API activity fallback. A host must inject the runtime and
the grouped `AgentGUINodeProps` responsibility objects.

## Boundary Rule

`AgentActivity*` types from `@tutti-os/agent-activity-core` are the canonical
frontend agent activity model. Production reads use exported engine selectors;
production writes use engine commands. GUI modules must not read entity maps,
subscribe to daemon streams, or reconstruct session/turn lifecycle from
messages.

Runtime identity is explicit: each consumer resolves the injected engine and
verifies its `(workspaceId, origin)` identity. Module-global runtime slots and
hidden origin registries are forbidden.

Run this boundary check after changing AgentGUI data flow:

```sh
pnpm check:agent-activity-runtime-boundaries
```

## Node Contract

`AgentGUINodeProps` has eight required top-level responsibilities:
`identity`, `workspace`, `frame`, `state`, `runtimeRequests`,
`hostCapabilities`, `hostActions`, and `renderSlots`. Extend the owning object;
do not restore flat compatibility props.

## Provider Targets

`provider` remains the real provider identity, such as `codex`,
`claude-code`, or `nexight`. AgentGUI uses that identity for composer options,
settings, icons, probes, status, and provider-specific UI policy.

Hosts may pass `providerTargets` when a real provider has multiple launch
targets. A target has display metadata plus an opaque `ref`:

```ts
export interface AgentGUIProviderTargetRef {
  kind: string;
  provider: AgentGUIProvider;
  [key: string]: unknown;
}

export interface AgentGUIProviderTarget {
  targetId: string;
  provider: AgentGUIProvider;
  ref: AgentGUIProviderTargetRef;
  label: string;
  description?: string;
  ownerLabel?: string;
  disabled?: boolean;
  unavailableReason?: string;
}
```

AgentGUI does not interpret `ref.kind` and does not treat `targetId` or `ref`
as authority. It displays `target.label`, keeps provider logic keyed by the
real `target.provider`, and starts new sessions with the selected
`agentTargetId`. Trusted host code must re-authenticate the current
user/workspace and resolve any invocation plan before launching.

Runnable provider targets are host-supplied. If the target catalog is absent,
AgentGUI presents an explicit unavailable state; it does not synthesize local
targets from presentation metadata.

Hosts that need to brand the aggregate provider rail entry may pass
`providerRailAllPresentation.iconUrl`. This only changes the `All` filter icon;
single agent or target icons continue to come from `providerTargets[].iconUrl`.

Hosts adapting daemon-owned agent targets must resolve the target's descriptor
`iconKey` instead of assuming it equals the provider ID. The narrow
`@tutti-os/agent-gui/provider-icons` subpath exports
`resolveProviderIconAsset(iconKey, variant)` for that adapter seam. Unknown
keys return `null`; hosts should render a neutral icon rather than silently
substituting another provider's icon.

Hosts that need provider identity presentation may call
`resolveAgentGUIProviderIdentity(value)` from the narrow
`@tutti-os/agent-gui/provider-identity` subpath. Migrated providers resolve from
the generated descriptor catalog, which is checked against the daemon provider
registry and OpenAPI provider enums.

Hosts that need custom main-pane presentation for a disabled selected target may
pass `renderProviderUnavailableState`. AgentGUI calls this renderer only when
the selected `providerTargets[]` entry has `disabled: true`; install, login,
checking, and retry readiness gates keep the built-in AgentGUI flows.
