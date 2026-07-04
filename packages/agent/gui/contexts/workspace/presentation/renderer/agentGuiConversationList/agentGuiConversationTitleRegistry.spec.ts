import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAgentGUIConversationServerTitles,
  getAgentGUIConversationServerTitles,
  pruneAgentGUIConversationServerTitles,
  removeAgentGUIConversationServerTitles,
  reportAgentGUIConversationServerTitles,
  resetAgentGUIConversationServerTitlesForTests,
  subscribeAgentGUIConversationServerTitles
} from "./agentGuiConversationTitleRegistry";

function summary(input: {
  id: string;
  title: string;
  titleFallback?: "generic-agent" | null;
  updatedAtUnixMs: number;
}) {
  return {
    provider: "codex" as const,
    titleFallback: null,
    ...input
  };
}

describe("agentGuiConversationTitleRegistry", () => {
  afterEach(() => {
    resetAgentGUIConversationServerTitlesForTests();
  });

  it("keeps the newest report per conversation and ignores stale ones", () => {
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "First", updatedAtUnixMs: 20 }
    ]);
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Stale", updatedAtUnixMs: 10 }
    ]);

    expect(getAgentGUIConversationServerTitles("room-1").get("s1")).toEqual({
      title: "First",
      updatedAtUnixMs: 20
    });

    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Newer", updatedAtUnixMs: 30 }
    ]);
    expect(getAgentGUIConversationServerTitles("room-1").get("s1")?.title).toBe(
      "Newer"
    );
  });

  it("scopes entries by workspace", () => {
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Title", updatedAtUnixMs: 20 }
    ]);
    expect(getAgentGUIConversationServerTitles("room-2").size).toBe(0);
  });

  it("notifies subscribers and returns a stable snapshot between changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAgentGUIConversationServerTitles(listener);
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Title", updatedAtUnixMs: 20 }
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    const first = getAgentGUIConversationServerTitles("room-1");
    expect(getAgentGUIConversationServerTitles("room-1")).toBe(first);

    // Same title and timestamp is a no-op: no notify, same snapshot.
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Title", updatedAtUnixMs: 20 }
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAgentGUIConversationServerTitles("room-1")).toBe(first);
    unsubscribe();
  });

  it("applies entries onto stale summaries and overrides placeholder rows regardless of timestamps", () => {
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "stale", title: "Renamed", updatedAtUnixMs: 20 },
      {
        conversationId: "placeholder",
        title: "Real title",
        updatedAtUnixMs: 20
      }
    ]);

    const items = [
      // Stale durable title with an older timestamp: entry wins.
      summary({ id: "stale", title: "Old", updatedAtUnixMs: 10 }),
      // Provider-label placeholder with a NEWER timestamp: entry still wins,
      // because session updatedAt moves with activity, not with titles.
      summary({ id: "placeholder", title: "Codex", updatedAtUnixMs: 30 }),
      summary({ id: "untouched", title: "Keep", updatedAtUnixMs: 5 })
    ];
    const applied = applyAgentGUIConversationServerTitles("room-1", items);

    expect(applied[0]).toMatchObject({
      title: "Renamed",
      titleFallback: null,
      updatedAtUnixMs: 20
    });
    expect(applied[1]).toMatchObject({
      title: "Real title",
      // Recency ordering keeps the newer activity timestamp.
      updatedAtUnixMs: 30
    });
    expect(applied[2]).toBe(items[2]);
  });

  it("does not apply an entry that durable data outran", () => {
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Older auto title", updatedAtUnixMs: 20 }
    ]);
    const items = [
      summary({ id: "s1", title: "Newer auto title", updatedAtUnixMs: 30 })
    ];
    expect(applyAgentGUIConversationServerTitles("room-1", items)).toBe(items);
  });

  it("returns the input array identity when nothing applies", () => {
    const items = [summary({ id: "s1", title: "Keep", updatedAtUnixMs: 10 })];
    expect(applyAgentGUIConversationServerTitles("room-1", items)).toBe(items);
  });

  it("prunes entries confirmed or outrun by durable data", () => {
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "confirmed", title: "Same", updatedAtUnixMs: 20 },
      { conversationId: "outrun", title: "Old", updatedAtUnixMs: 20 },
      { conversationId: "pending", title: "Pending", updatedAtUnixMs: 20 }
    ]);

    pruneAgentGUIConversationServerTitles("room-1", [
      summary({ id: "confirmed", title: "Same", updatedAtUnixMs: 25 }),
      summary({ id: "outrun", title: "Newer", updatedAtUnixMs: 30 }),
      // Still-stale durable row must NOT prune the pending entry.
      summary({ id: "pending", title: "Stale", updatedAtUnixMs: 10 }),
      // A placeholder row never prunes: it carries no title information.
      summary({ id: "pending", title: "Codex", updatedAtUnixMs: 40 })
    ]);

    const titles = getAgentGUIConversationServerTitles("room-1");
    expect(titles.has("confirmed")).toBe(false);
    expect(titles.has("outrun")).toBe(false);
    expect(titles.get("pending")?.title).toBe("Pending");
  });

  it("removes entries for deleted conversations", () => {
    reportAgentGUIConversationServerTitles("room-1", [
      { conversationId: "s1", title: "Title", updatedAtUnixMs: 20 }
    ]);
    removeAgentGUIConversationServerTitles("room-1", ["s1"]);
    expect(getAgentGUIConversationServerTitles("room-1").size).toBe(0);
  });
});
