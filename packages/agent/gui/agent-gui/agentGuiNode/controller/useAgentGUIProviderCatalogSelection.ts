import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  agentGUIProviderTargetRefsEqual,
  normalizeAgentGUIProviderTargets,
  resolveAgentGUIProviderTarget
} from "../../../providerTargets";
import type {
  AgentGUINodeData,
  AgentGUIProvider,
  AgentGUIProviderRailMode,
  AgentGUIProviderReadinessGate,
  AgentGUIProviderTarget
} from "../../../types";
import {
  composerTargetDataFromNodeData,
  type AgentGUIComposerTargetData
} from "./agentGuiController.composerPresentation";
import { normalizeOptionalText } from "./agentGuiController.promptHelpers";
import {
  applyComingSoonProviderTargets,
  emptyComingSoonProviders
} from "./agentGuiController.draftMessageHelpers";
import {
  agentGUINodeDataHasComposerTarget,
  agentGUIProviderTargetsEqual,
  composerTargetDataFromProviderTarget
} from "./agentGuiController.providerHelpers";

interface UseAgentGUIProviderCatalogSelectionInput {
  comingSoonProviders: readonly AgentGUIProvider[] | undefined;
  data: AgentGUINodeData;
  defaultProviderTargetId: string | null | undefined;
  providerRailMode: AgentGUIProviderRailMode | undefined;
  providerReadinessGates:
    | Partial<Record<AgentGUIProvider, AgentGUIProviderReadinessGate | null>>
    | null
    | undefined;
  providerTargets: readonly AgentGUIProviderTarget[] | undefined;
  providerTargetsLoading: boolean | undefined;
}

export function useAgentGUIProviderCatalogSelection(
  input: UseAgentGUIProviderCatalogSelectionInput
): {
  effectiveSelectedProviderTarget: AgentGUIProviderTarget;
  firstReadyHomeComposerProviderTarget: AgentGUIProviderTarget | null;
  handoffProviderTargets: readonly AgentGUIProviderTarget[];
  homeComposerTargetOverride: AgentGUIProviderTarget | null;
  homeComposerTargetOverrideIsExplicit: boolean;
  normalizedComingSoonProviders: readonly AgentGUIProvider[];
  normalizedExplicitProviderTargets: readonly AgentGUIProviderTarget[];
  normalizedProviderTargets: readonly AgentGUIProviderTarget[];
  selectedComposerTargetData: AgentGUIComposerTargetData;
  selectedProviderTarget: AgentGUIProviderTarget;
  selectedProviderTargetIsExplicit: boolean;
  setHomeComposerTargetOverride: Dispatch<
    SetStateAction<AgentGUIProviderTarget | null>
  >;
  shouldUseStaticProviderTargets: boolean;
} {
  const {
    comingSoonProviders,
    data,
    defaultProviderTargetId,
    providerRailMode,
    providerReadinessGates,
    providerTargets,
    providerTargetsLoading
  } = input;
  const normalizedComingSoonProviders = useMemo(
    () =>
      comingSoonProviders && comingSoonProviders.length > 0
        ? ([...comingSoonProviders] as readonly AgentGUIProvider[])
        : emptyComingSoonProviders,
    [comingSoonProviders]
  );
  const isExactProviderRailMode = providerRailMode === "exact";
  const normalizedExplicitProviderTargets = useMemo(() => {
    const normalized = normalizeAgentGUIProviderTargets(providerTargets, {
      includeDisabledPlaceholders: !isExactProviderRailMode,
      useStaticCatalog: false
    });
    return isExactProviderRailMode
      ? normalized
      : applyComingSoonProviderTargets(
          normalized,
          normalizedComingSoonProviders
        );
  }, [isExactProviderRailMode, normalizedComingSoonProviders, providerTargets]);
  const normalizedProviderTargets = useMemo(() => {
    if (providerTargetsLoading) return [];
    if (
      !isExactProviderRailMode &&
      (providerTargets === undefined ||
        normalizedExplicitProviderTargets.length === 0)
    ) {
      return applyComingSoonProviderTargets(
        normalizeAgentGUIProviderTargets(null, {
          includeDisabledPlaceholders: true
        }),
        normalizedComingSoonProviders
      );
    }
    return normalizedExplicitProviderTargets;
  }, [
    isExactProviderRailMode,
    normalizedComingSoonProviders,
    normalizedExplicitProviderTargets,
    providerTargets,
    providerTargetsLoading
  ]);
  const shouldUseStaticProviderTargets =
    !isExactProviderRailMode &&
    !providerTargetsLoading &&
    (providerTargets === undefined ||
      normalizedExplicitProviderTargets.length === 0);
  const handoffProviderTargets = useMemo(
    () =>
      providerTargetsLoading
        ? []
        : normalizedExplicitProviderTargets.filter(
            (target) => target.disabled !== true
          ),
    [normalizedExplicitProviderTargets, providerTargetsLoading]
  );
  const selectedProviderTarget = useMemo(
    () =>
      resolveAgentGUIProviderTarget({
        agentTargetId: data.agentTargetId,
        defaultProviderTargetId,
        provider: data.provider,
        providerTargets: normalizedProviderTargets,
        useStaticCatalog: shouldUseStaticProviderTargets
      }) ?? {
        targetId: data.agentTargetId ?? "__loading__",
        provider: data.provider,
        ref: { kind: "loading", provider: data.provider },
        label: data.provider,
        disabled: true
      },
    [
      data.agentTargetId,
      data.provider,
      defaultProviderTargetId,
      normalizedProviderTargets,
      shouldUseStaticProviderTargets
    ]
  );
  const selectedProviderTargetIsExplicit = useMemo(
    () =>
      normalizedExplicitProviderTargets.some(
        (target) =>
          target.provider === selectedProviderTarget.provider &&
          target.targetId === selectedProviderTarget.targetId &&
          agentGUIProviderTargetRefsEqual(
            target.ref,
            selectedProviderTarget.ref
          )
      ),
    [normalizedExplicitProviderTargets, selectedProviderTarget]
  );
  const [homeComposerTargetOverride, setHomeComposerTargetOverride] =
    useState<AgentGUIProviderTarget | null>(null);
  const homeComposerTargetOverrideIsExplicit = useMemo(
    () =>
      homeComposerTargetOverride
        ? normalizedExplicitProviderTargets.some(
            (target) =>
              target.provider === homeComposerTargetOverride.provider &&
              target.targetId === homeComposerTargetOverride.targetId &&
              agentGUIProviderTargetRefsEqual(
                target.ref,
                homeComposerTargetOverride.ref
              )
          )
        : false,
    [homeComposerTargetOverride, normalizedExplicitProviderTargets]
  );
  const effectiveSelectedProviderTarget =
    homeComposerTargetOverride ?? selectedProviderTarget;
  const firstReadyHomeComposerProviderTarget = useMemo(
    () =>
      providerReadinessGates
        ? (normalizedProviderTargets.find(
            (target) =>
              target.disabled !== true &&
              providerReadinessGates[target.provider] === null
          ) ?? null)
        : null,
    [normalizedProviderTargets, providerReadinessGates]
  );
  const nodeComposerTargetResolvedByProviderTarget =
    agentGUINodeDataHasComposerTarget(data) &&
    normalizeOptionalText(data.agentTargetId) !== null &&
    selectedProviderTarget.agentTargetId ===
      normalizeOptionalText(data.agentTargetId);
  const selectedComposerTargetData = useMemo(
    () =>
      homeComposerTargetOverride
        ? composerTargetDataFromProviderTarget({
            current: data,
            isExplicit: homeComposerTargetOverrideIsExplicit,
            target: homeComposerTargetOverride
          })
        : nodeComposerTargetResolvedByProviderTarget
          ? composerTargetDataFromProviderTarget({
              current: data,
              isExplicit: selectedProviderTargetIsExplicit,
              target: selectedProviderTarget
            })
          : agentGUINodeDataHasComposerTarget(data)
            ? composerTargetDataFromNodeData(data)
            : composerTargetDataFromProviderTarget({
                current: data,
                isExplicit: selectedProviderTargetIsExplicit,
                target: selectedProviderTarget
              }),
    [
      data,
      homeComposerTargetOverride,
      homeComposerTargetOverrideIsExplicit,
      nodeComposerTargetResolvedByProviderTarget,
      selectedProviderTarget,
      selectedProviderTargetIsExplicit
    ]
  );

  useEffect(() => {
    if (
      homeComposerTargetOverride &&
      agentGUIProviderTargetsEqual(
        homeComposerTargetOverride,
        selectedProviderTarget
      )
    ) {
      setHomeComposerTargetOverride(null);
    }
  }, [homeComposerTargetOverride, selectedProviderTarget]);

  return {
    effectiveSelectedProviderTarget,
    firstReadyHomeComposerProviderTarget,
    handoffProviderTargets,
    homeComposerTargetOverride,
    homeComposerTargetOverrideIsExplicit,
    normalizedComingSoonProviders,
    normalizedExplicitProviderTargets,
    normalizedProviderTargets,
    selectedComposerTargetData,
    selectedProviderTarget,
    selectedProviderTargetIsExplicit,
    setHomeComposerTargetOverride,
    shouldUseStaticProviderTargets
  };
}
