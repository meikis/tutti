import type { AgentGUIComposerSettingOption } from "./agentGuiNodeTypes";

/**
 * Plan mode rides the permission mode selector as a virtual option: it is a
 * negotiated capability rather than a backend permission mode, so selecting
 * it maps onto the planMode setting instead of permissionModeId. Shared by
 * the dropdown and the Shift+Tab cycle so both surfaces stay in lockstep.
 */
export const PLAN_MODE_OPTION_VALUE = "plan";

export function composerModeOptions(input: {
  availablePermissionModes: readonly AgentGUIComposerSettingOption[];
  supportsPlanMode: boolean;
  planModeLabel: string;
}): AgentGUIComposerSettingOption[] {
  const options = [...input.availablePermissionModes];
  if (input.supportsPlanMode) {
    options.push({
      value: PLAN_MODE_OPTION_VALUE,
      label: input.planModeLabel
    });
  }
  return options;
}

export function composerModeSelectedValue(input: {
  planModeActive: boolean;
  selectedPermissionModeValue: string | null | undefined;
}): string | null {
  if (input.planModeActive) {
    return PLAN_MODE_OPTION_VALUE;
  }
  return input.selectedPermissionModeValue ?? null;
}

export function composerModeSelectionPatch(
  value: string,
  planModeActive: boolean
): { permissionModeId?: string; planMode?: boolean } {
  if (value === PLAN_MODE_OPTION_VALUE) {
    return { planMode: true };
  }
  return planModeActive
    ? { permissionModeId: value, planMode: false }
    : { permissionModeId: value };
}

export function nextComposerModeValue(
  options: readonly AgentGUIComposerSettingOption[],
  currentValue: string | null | undefined
): string | null {
  if (options.length < 2) {
    return null;
  }
  const currentIndex = options.findIndex(
    (option) => option.value === currentValue
  );
  if (currentIndex === -1) {
    return options[0]?.value ?? null;
  }
  return options[(currentIndex + 1) % options.length]?.value ?? null;
}
