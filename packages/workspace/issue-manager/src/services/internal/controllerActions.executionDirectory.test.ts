import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceUserProjectApi } from "@tutti-os/workspace-user-project/contracts";
import { createControllerActionsHarness } from "./controllerActionTestHarness.ts";

test("controller actions useExecutionDirectory updates state and remembers the project", async () => {
  const usedPaths: string[] = [];
  const harness = createControllerActionsHarness({
    executionDirectoryPicker: {
      async use(
        input: Parameters<NonNullable<WorkspaceUserProjectApi["use"]>>[0]
      ) {
        usedPaths.push(input.path);
        return {
          id: "project-1",
          label: "tutti",
          path: input.path
        };
      }
    }
  });

  await harness.actions.useExecutionDirectory("  /workspace/tutti  ");

  assert.deepEqual(usedPaths, ["/workspace/tutti"]);
  assert.equal(
    harness.nodeState.current.selectedExecutionDirectory,
    "/workspace/tutti"
  );
});

test("controller actions keep selected execution directory when recency tracking fails", async () => {
  const harness = createControllerActionsHarness({
    executionDirectoryPicker: {
      async use() {
        throw new Error("recency failed");
      }
    }
  });

  await harness.actions.useExecutionDirectory("/workspace/tutti");

  assert.equal(
    harness.nodeState.current.selectedExecutionDirectory,
    "/workspace/tutti"
  );
  assert.equal(harness.notificationState.current, null);
});

test("controller actions support missing execution directory picker methods", async () => {
  const harness = createControllerActionsHarness({
    executionDirectoryPicker: {}
  });

  await harness.actions.useExecutionDirectory("/workspace/tutti");

  assert.equal(
    harness.nodeState.current.selectedExecutionDirectory,
    "/workspace/tutti"
  );
});
