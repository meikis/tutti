import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceAppCenterViewState } from "@tutti-os/workspace-app-center";
import { createStandaloneAgentWorkspaceAppSurfacePresenter } from "./standaloneAgentWorkspaceAppSurfacePresenter.ts";

test("standalone agent app presenter selects the app before runtime preparation", () => {
  const calls: string[] = [];
  let viewState: WorkspaceAppCenterViewState = {
    activeAppTab: "recommended",
    openAppId: null
  };
  const presenter = createStandaloneAgentWorkspaceAppSurfacePresenter({
    ensureWorkspaceAppPolling: () => calls.push("poll"),
    getViewState: () => viewState,
    setViewState: ({ state }) => {
      viewState = { ...viewState, ...state };
      calls.push(`select:${viewState.openAppId ?? ""}`);
    },
    workspaceId: "workspace-1"
  });

  presenter.beginOpen({
    appId: "ai-slide",
    attemptId: 1,
    workspaceId: "workspace-1"
  });

  assert.equal(viewState.openAppId, "ai-slide");
  assert.deepEqual(calls, ["poll", "select:ai-slide"]);
});

test("standalone agent app presenter does not let a stale failure clear a newer selection", () => {
  let viewState: WorkspaceAppCenterViewState = {
    activeAppTab: "recommended",
    openAppId: null
  };
  const presenter = createStandaloneAgentWorkspaceAppSurfacePresenter({
    ensureWorkspaceAppPolling() {},
    getViewState: () => viewState,
    setViewState: ({ state }) => {
      viewState = { ...viewState, ...state };
    },
    workspaceId: "workspace-1"
  });
  const first = {
    appId: "ai-slide",
    attemptId: 1,
    workspaceId: "workspace-1"
  };
  presenter.beginOpen(first);
  presenter.beginOpen({
    appId: "ai-doc",
    attemptId: 2,
    workspaceId: "workspace-1"
  });

  presenter.rollbackOpen(first);

  assert.equal(viewState.openAppId, "ai-doc");
});
