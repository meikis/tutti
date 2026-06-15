import { describe, expect, it } from "vitest";
import {
  INITIAL_USAGE_ALERT_STATE,
  nextUsageAlert,
  type UsageAlertState
} from "./agentUsageAlerts";

const initial: UsageAlertState = INITIAL_USAGE_ALERT_STATE;

describe("nextUsageAlert", () => {
  it("does not fire below the warn threshold", () => {
    const result = nextUsageAlert(79, initial);
    expect(result.fire).toBeNull();
    expect(result.state).toEqual({ warned: false, criticaled: false });
  });

  it("fires warn once when crossing the warn threshold", () => {
    const first = nextUsageAlert(80, initial);
    expect(first.fire).toBe("warn");
    expect(first.state).toEqual({ warned: true, criticaled: false });

    const second = nextUsageAlert(85, first.state);
    expect(second.fire).toBeNull();
    expect(second.state).toEqual({ warned: true, criticaled: false });
  });

  it("fires critical when crossing the critical threshold after warn", () => {
    const warned: UsageAlertState = { warned: true, criticaled: false };
    const result = nextUsageAlert(95, warned);
    expect(result.fire).toBe("critical");
    expect(result.state).toEqual({ warned: true, criticaled: true });
  });

  it("fires critical directly when jumping past both thresholds", () => {
    const result = nextUsageAlert(97, initial);
    expect(result.fire).toBe("critical");
    expect(result.state).toEqual({ warned: true, criticaled: true });
  });

  it("does not refire critical while staying at or above the threshold", () => {
    const criticaled: UsageAlertState = { warned: true, criticaled: true };
    const result = nextUsageAlert(99, criticaled);
    expect(result.fire).toBeNull();
    expect(result.state).toEqual(criticaled);
  });

  it("does not refire warn when falling back into the warn band", () => {
    const criticaled: UsageAlertState = { warned: true, criticaled: true };
    const result = nextUsageAlert(85, criticaled);
    expect(result.fire).toBeNull();
    expect(result.state).toEqual(criticaled);
  });

  it("resets when usage falls below the warn threshold", () => {
    const criticaled: UsageAlertState = { warned: true, criticaled: true };
    const reset = nextUsageAlert(40, criticaled);
    expect(reset.fire).toBeNull();
    expect(reset.state).toEqual({ warned: false, criticaled: false });

    const refired = nextUsageAlert(82, reset.state);
    expect(refired.fire).toBe("warn");
  });

  it("keeps state unchanged when percent is null", () => {
    const warned: UsageAlertState = { warned: true, criticaled: false };
    const result = nextUsageAlert(null, warned);
    expect(result.fire).toBeNull();
    expect(result.state).toEqual(warned);
  });
});
