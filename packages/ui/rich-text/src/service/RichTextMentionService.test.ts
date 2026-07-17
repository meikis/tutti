import assert from "node:assert/strict";
import test from "node:test";
import type { RichTextMentionResolved } from "../types/mention.ts";
import type { RichTextTriggerProvider } from "../types/trigger.ts";
import {
  RICH_TEXT_MENTION_CACHE_CAPACITY,
  RICH_TEXT_MENTION_ERROR_RETRY_MS,
  RICH_TEXT_MENTION_MISSING_TTL_MS,
  RICH_TEXT_MENTION_READY_TTL_MS,
  createRichTextMentionService
} from "./RichTextMentionService.ts";
import { createRichTextMentionIdentityKey } from "./richTextMentionIdentityKey.ts";

const identity = {
  providerId: " workspace-app ",
  entityId: " app-1 ",
  label: "Canvas",
  scope: { workspaceId: "workspace-1", z: "last", a: "first" }
};

function createProvider(
  resolveMention: RichTextTriggerProvider["resolveMention"]
): RichTextTriggerProvider {
  return {
    id: "workspace-app",
    trigger: "@",
    query: () => [],
    getItemKey: () => "",
    getItemLabel: () => "",
    toInsertResult: () => ({ kind: "text", text: "" }),
    resolveMention
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("identity key normalizes identity and canonicalizes scope", () => {
  const left = createRichTextMentionIdentityKey(identity);
  const right = createRichTextMentionIdentityKey({
    ...identity,
    providerId: "workspace-app",
    entityId: "app-1",
    label: "Renamed",
    scope: { a: "first", workspaceId: "workspace-1", z: "last" }
  });
  assert.equal(left, right);
  assert.notEqual(
    left,
    createRichTextMentionIdentityKey({ ...identity, entityId: "app-2" })
  );
});

test("ready, missing, and error snapshots honor fixed TTLs", async () => {
  let time = 1_000;
  let calls = 0;
  let result: RichTextMentionResolved | null = {
    presentation: { iconUrl: "first.png" }
  };
  let shouldReject = false;
  const service = createRichTextMentionService({
    now: () => time,
    providers: [
      createProvider(() => {
        calls += 1;
        if (shouldReject) throw new Error("offline");
        return result;
      })
    ]
  });

  assert.equal((await service.resolve(identity)).state, "ready");
  time += RICH_TEXT_MENTION_READY_TTL_MS - 1;
  await service.resolve(identity);
  assert.equal(calls, 1);
  time += 1;
  result = { presentation: { iconUrl: "second.png" } };
  const stale = await service.resolve(identity);
  assert.equal(stale.resolved?.presentation?.iconUrl, "first.png");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    service.getSnapshot(identity).resolved?.presentation?.iconUrl,
    "second.png"
  );

  service.invalidate();
  result = null;
  await service.resolve(identity);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(service.getSnapshot(identity).state, "missing");
  const afterMissing = calls;
  time += RICH_TEXT_MENTION_MISSING_TTL_MS - 1;
  await service.resolve(identity);
  assert.equal(calls, afterMissing);
  time += 1;
  await service.resolve(identity);
  assert.equal(calls, afterMissing + 1);

  service.invalidate();
  shouldReject = true;
  await service.resolve(identity);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(service.getSnapshot(identity).state, "error");
  const afterError = calls;
  time += RICH_TEXT_MENTION_ERROR_RETRY_MS - 1;
  await service.resolve(identity);
  assert.equal(calls, afterError);
  time += 1;
  await service.resolve(identity);
  assert.equal(calls, afterError + 1);
});

test("concurrent resolves are single-flight", async () => {
  const pending = deferred<RichTextMentionResolved | null>();
  let calls = 0;
  const service = createRichTextMentionService({
    providers: [
      createProvider(() => {
        calls += 1;
        return pending.promise;
      })
    ]
  });
  const resolutions = Array.from({ length: 100 }, () =>
    service.resolve(identity)
  );
  await Promise.resolve();
  assert.equal(calls, 1);
  pending.resolve({ presentation: { iconUrl: "resolved.png" } });
  const snapshots = await Promise.all(resolutions);
  assert.equal(
    snapshots.every((snapshot) => snapshot.state === "ready"),
    true
  );
});

test("in-flight invalidation schedules exactly one trailing resolve", async () => {
  const first = deferred<RichTextMentionResolved | null>();
  const second = deferred<RichTextMentionResolved | null>();
  let calls = 0;
  const service = createRichTextMentionService({
    providers: [
      createProvider(() => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      })
    ]
  });
  const initial = service.resolve(identity);
  await Promise.resolve();
  service.invalidate({ providerId: "workspace-app" });
  service.invalidate({ entityId: "app-1" });
  service.invalidate({ workspaceId: "workspace-1" });
  first.resolve({ presentation: { iconUrl: "stale.png" } });
  await initial;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  second.resolve({ presentation: { iconUrl: "fresh.png" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  assert.equal(
    service.getSnapshot(identity).resolved?.presentation?.iconUrl,
    "fresh.png"
  );
});

test("dispose is idempotent and ignores late resolver completion", async () => {
  const pending = deferred<RichTextMentionResolved | null>();
  const service = createRichTextMentionService({
    providers: [createProvider(() => pending.promise)]
  });
  let notifications = 0;
  service.subscribe(() => {
    notifications += 1;
  });
  const resolution = service.resolve(identity);
  service.dispose();
  service.dispose();
  pending.resolve({ presentation: { iconUrl: "late.png" } });
  await resolution;
  assert.equal(service.getSnapshot(identity).state, "idle");
  assert.equal(notifications, 1);
});

test("capacity eviction preserves subscribed and in-flight identities", async () => {
  const pending = deferred<RichTextMentionResolved | null>();
  const calls = new Map<string, number>();
  const service = createRichTextMentionService({
    providers: [
      createProvider((currentIdentity) => {
        calls.set(
          currentIdentity.entityId,
          (calls.get(currentIdentity.entityId) ?? 0) + 1
        );
        return currentIdentity.entityId === "in-flight"
          ? pending.promise
          : { label: currentIdentity.entityId };
      })
    ]
  });
  const retainedIdentity = { ...identity, entityId: "retained" };
  const unsubscribe = service.subscribe(() => {}, retainedIdentity);
  await service.resolve(retainedIdentity);
  const inFlightIdentity = { ...identity, entityId: "in-flight" };
  const inFlight = service.resolve(inFlightIdentity);

  for (let index = 0; index < RICH_TEXT_MENTION_CACHE_CAPACITY; index += 1) {
    await service.resolve({ ...identity, entityId: `entry-${index}` });
  }

  await service.resolve(retainedIdentity);
  assert.equal(calls.get("retained"), 1);
  assert.equal(calls.get("in-flight"), 1);
  pending.resolve({ label: "completed" });
  await inFlight;
  unsubscribe();
});

test("invalidation refreshes a subscribed identity", async () => {
  let calls = 0;
  const service = createRichTextMentionService({
    providers: [
      createProvider(() => ({
        presentation: { iconUrl: `icon-${++calls}.png` }
      }))
    ]
  });
  const unsubscribe = service.subscribe(() => {}, identity);
  await service.resolve(identity);

  service.invalidate({ workspaceId: "workspace-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 2);
  assert.equal(
    service.getSnapshot(identity).resolved?.presentation?.iconUrl,
    "icon-2.png"
  );
  unsubscribe();
});
