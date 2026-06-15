import { describe, expect, it } from "vitest";
import {
  PLAN_MODE_OPTION_VALUE,
  composerModeOptions,
  composerModeSelectedValue,
  composerModeSelectionPatch,
  nextComposerModeValue
} from "./composerModeCycle";

const permissionModes = [
  { value: "default", label: "Ask for approval" },
  { value: "acceptEdits", label: "Accept edits" }
];

describe("composerModeCycle", () => {
  it("appends the plan option when the capability is negotiated", () => {
    const options = composerModeOptions({
      availablePermissionModes: permissionModes,
      supportsPlanMode: true,
      planModeLabel: "Plan Mode"
    });
    expect(options.map((option) => option.value)).toEqual([
      "default",
      "acceptEdits",
      PLAN_MODE_OPTION_VALUE
    ]);
  });

  it("omits the plan option without the capability", () => {
    const options = composerModeOptions({
      availablePermissionModes: permissionModes,
      supportsPlanMode: false,
      planModeLabel: "Plan Mode"
    });
    expect(options.map((option) => option.value)).toEqual([
      "default",
      "acceptEdits"
    ]);
  });

  it("selects the plan value while plan mode is active", () => {
    expect(
      composerModeSelectedValue({
        planModeActive: true,
        selectedPermissionModeValue: "default"
      })
    ).toBe(PLAN_MODE_OPTION_VALUE);
    expect(
      composerModeSelectedValue({
        planModeActive: false,
        selectedPermissionModeValue: "default"
      })
    ).toBe("default");
  });

  it("maps selections onto planMode or permissionModeId patches", () => {
    expect(composerModeSelectionPatch(PLAN_MODE_OPTION_VALUE, false)).toEqual({
      planMode: true
    });
    expect(composerModeSelectionPatch("acceptEdits", true)).toEqual({
      permissionModeId: "acceptEdits",
      planMode: false
    });
    expect(composerModeSelectionPatch("acceptEdits", false)).toEqual({
      permissionModeId: "acceptEdits"
    });
  });

  it("cycles through options and wraps around", () => {
    const options = composerModeOptions({
      availablePermissionModes: permissionModes,
      supportsPlanMode: true,
      planModeLabel: "Plan Mode"
    });
    expect(nextComposerModeValue(options, "default")).toBe("acceptEdits");
    expect(nextComposerModeValue(options, "acceptEdits")).toBe(
      PLAN_MODE_OPTION_VALUE
    );
    expect(nextComposerModeValue(options, PLAN_MODE_OPTION_VALUE)).toBe(
      "default"
    );
  });

  it("starts from the first option when the current value is unknown", () => {
    const options = composerModeOptions({
      availablePermissionModes: permissionModes,
      supportsPlanMode: false,
      planModeLabel: "Plan Mode"
    });
    expect(nextComposerModeValue(options, "custom-mode")).toBe("default");
    expect(nextComposerModeValue(options, null)).toBe("default");
  });

  it("returns null when there is nothing to cycle to", () => {
    expect(nextComposerModeValue([], "default")).toBeNull();
    expect(
      nextComposerModeValue([{ value: "default", label: "Ask" }], "default")
    ).toBeNull();
  });
});
