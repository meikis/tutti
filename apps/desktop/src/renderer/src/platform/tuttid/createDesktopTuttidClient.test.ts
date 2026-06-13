import assert from "node:assert/strict";
import test from "node:test";
import type { DesktopRuntimeApi } from "@preload/types";
import { createDesktopTuttidClient } from "./createDesktopTuttidClient.ts";

test("createDesktopTuttidClient forwards workspace agent session query params", async () => {
  let requestMethod = "";
  let requestPath = "";
  let requestQueryEntries: Record<string, string> = {};
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requestMethod = request.method;
    requestPath = url.pathname;
    requestQueryEntries = Object.fromEntries(url.searchParams.entries());

    return new Response(
      JSON.stringify({
        sessions: [],
        workspaceId: "ws-1"
      }),
      {
        headers: {
          "content-type": "application/json"
        },
        status: 200
      }
    );
  };

  try {
    const client = createDesktopTuttidClient({
      getBackendConfig: async () => ({
        accessToken: "test-token",
        baseUrl: "http://127.0.0.1:18080"
      })
    } as DesktopRuntimeApi);

    await client.listWorkspaceAgentSessions("ws-1", {
      limit: 30,
      searchQuery: "mention",
      visibleOnly: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestMethod, "GET");
  assert.equal(requestPath, "/v1/workspaces/ws-1/agent-sessions");
  assert.deepEqual(requestQueryEntries, {
    limit: "30",
    searchQuery: "mention",
    visibleOnly: "true"
  });
});
