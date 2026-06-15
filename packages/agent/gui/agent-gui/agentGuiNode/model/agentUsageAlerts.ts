import {
  USAGE_CRITICAL_PERCENT,
  USAGE_WARN_PERCENT
} from "./agentUsageThresholds";

export type UsageAlertTier = "warn" | "critical";

export interface UsageAlertState {
  warned: boolean;
  criticaled: boolean;
}

export const INITIAL_USAGE_ALERT_STATE: UsageAlertState = {
  warned: false,
  criticaled: false
};

/**
 * Threshold-crossing detector for context-usage reminders. Each tier fires at
 * most once while usage stays at or above its threshold; falling back below
 * the warn threshold re-arms both tiers. A `null` percent (usage unknown)
 * leaves the state untouched.
 */
export function nextUsageAlert(
  percentUsed: number | null,
  state: UsageAlertState
): { fire: UsageAlertTier | null; state: UsageAlertState } {
  if (percentUsed === null) {
    return { fire: null, state };
  }
  if (percentUsed >= USAGE_CRITICAL_PERCENT) {
    if (state.criticaled) {
      return { fire: null, state };
    }
    return { fire: "critical", state: { warned: true, criticaled: true } };
  }
  if (percentUsed >= USAGE_WARN_PERCENT) {
    if (state.warned) {
      return { fire: null, state };
    }
    return { fire: "warn", state: { ...state, warned: true } };
  }
  if (state.warned || state.criticaled) {
    return { fire: null, state: INITIAL_USAGE_ALERT_STATE };
  }
  return { fire: null, state };
}
