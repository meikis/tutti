import { createRichTextTriggerRegistry } from "../plugins/triggerRegistry.ts";
import type {
  RichTextMentionIdentity,
  RichTextMentionResolved
} from "../types/mention.ts";
import type {
  RichTextTriggerConfig,
  RichTextTriggerProvider,
  RichTextTriggerQueryInput,
  RichTextTriggerQueryMatch
} from "../types/trigger.ts";
import {
  createRichTextMentionIdentityKey,
  normalizeRichTextMentionIdentity,
  type NormalizedRichTextMentionIdentity
} from "./richTextMentionIdentityKey.ts";

export const RICH_TEXT_MENTION_READY_TTL_MS = 300_000;
export const RICH_TEXT_MENTION_MISSING_TTL_MS = 30_000;
export const RICH_TEXT_MENTION_ERROR_RETRY_MS = 5_000;
export const RICH_TEXT_MENTION_CACHE_CAPACITY = 1_000;

export type RichTextMentionResolutionState =
  | "idle"
  | "loading"
  | "ready"
  | "missing"
  | "error";

export interface RichTextMentionSnapshot {
  state: RichTextMentionResolutionState;
  resolved?: RichTextMentionResolved;
  updatedAtUnixMs?: number;
}

export interface RichTextMentionInvalidationSelector {
  providerId?: string;
  workspaceId?: string;
  entityId?: string;
}

export type RichTextMentionDiagnosticEventName =
  | "mention_query_completed"
  | "mention_resolve_completed"
  | "mention_cache_invalidated";

export interface RichTextMentionDiagnosticEvent {
  name: RichTextMentionDiagnosticEventName;
  providerId: string;
  outcome: "success" | "missing" | "error";
  cacheStatus: "hit" | "miss" | "stale" | "invalidated";
  durationMs: number;
}

export interface CreateRichTextMentionServiceInput {
  providers: readonly RichTextTriggerProvider[];
  now?: () => number;
  diagnostics?: (event: RichTextMentionDiagnosticEvent) => void;
}

export interface RichTextMentionService {
  listProviders(): readonly RichTextTriggerProvider[];
  getProvider(providerId: string): RichTextTriggerProvider | undefined;
  listTriggerConfigs(): readonly RichTextTriggerConfig[];
  query(
    input: RichTextTriggerQueryInput
  ): Promise<readonly RichTextTriggerQueryMatch[]>;
  resolve(identity: RichTextMentionIdentity): Promise<RichTextMentionSnapshot>;
  getSnapshot(identity: RichTextMentionIdentity): RichTextMentionSnapshot;
  invalidate(selector?: RichTextMentionInvalidationSelector): void;
  subscribe(
    listener: () => void,
    identity?: RichTextMentionIdentity
  ): () => void;
  dispose(): void;
}

interface MentionCacheEntry {
  identity: NormalizedRichTextMentionIdentity;
  key: string;
  snapshot: RichTextMentionSnapshot;
  expiresAt: number;
  lastAccess: number;
  revision: number;
  subscriberCount: number;
  inFlight?: Promise<RichTextMentionSnapshot>;
  invalidatedWhileInFlight: boolean;
}

const idleSnapshot: RichTextMentionSnapshot = Object.freeze({ state: "idle" });

export function createRichTextMentionService(
  input: CreateRichTextMentionServiceInput
): RichTextMentionService {
  const registry = createRichTextTriggerRegistry(input.providers);
  const now = input.now ?? Date.now;
  const entries = new Map<string, MentionCacheEntry>();
  const listeners = new Set<() => void>();
  let disposed = false;

  const emit = (event: RichTextMentionDiagnosticEvent): void => {
    input.diagnostics?.(event);
  };

  const notify = (): void => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };

  const evictIfNeeded = (): void => {
    if (entries.size <= RICH_TEXT_MENTION_CACHE_CAPACITY) return;
    const candidates = [...entries.values()]
      .filter((entry) => !entry.inFlight && entry.subscriberCount === 0)
      .sort((left, right) => left.lastAccess - right.lastAccess);
    while (
      entries.size > RICH_TEXT_MENTION_CACHE_CAPACITY &&
      candidates.length > 0
    ) {
      const entry = candidates.shift();
      if (entry) entries.delete(entry.key);
    }
  };

  const getOrCreateEntry = (
    identity: RichTextMentionIdentity
  ): MentionCacheEntry => {
    const normalized = normalizeRichTextMentionIdentity(identity);
    const key = createRichTextMentionIdentityKey(normalized);
    const existing = entries.get(key);
    if (existing) {
      existing.identity = normalized;
      existing.lastAccess = now();
      return existing;
    }
    const created: MentionCacheEntry = {
      identity: normalized,
      key,
      snapshot: idleSnapshot,
      expiresAt: 0,
      lastAccess: now(),
      revision: 0,
      subscriberCount: 0,
      invalidatedWhileInFlight: false
    };
    entries.set(key, created);
    evictIfNeeded();
    return created;
  };

  const startResolve = (
    entry: MentionCacheEntry
  ): Promise<RichTextMentionSnapshot> => {
    if (entry.inFlight) return entry.inFlight;
    if (disposed) return Promise.resolve(entry.snapshot);

    const startedAt = now();
    const requestRevision = entry.revision;
    const previousReady =
      entry.snapshot.state === "ready" ? entry.snapshot : undefined;
    if (!previousReady) {
      entry.snapshot = Object.freeze({ state: "loading" });
      notify();
    }

    const promise = Promise.resolve()
      .then(async () => {
        const provider = registry.getProvider(entry.identity.providerId);
        const resolved = provider?.resolveMention
          ? await provider.resolveMention(entry.identity)
          : null;
        if (disposed) return entry.snapshot;

        const completedAt = now();
        if (resolved) {
          entry.snapshot = Object.freeze({
            state: "ready",
            resolved,
            updatedAtUnixMs: completedAt
          });
          entry.expiresAt = completedAt + RICH_TEXT_MENTION_READY_TTL_MS;
          emit({
            name: "mention_resolve_completed",
            providerId: entry.identity.providerId,
            outcome: "success",
            cacheStatus: previousReady ? "stale" : "miss",
            durationMs: Math.max(0, completedAt - startedAt)
          });
        } else {
          entry.snapshot = Object.freeze({
            state: "missing",
            updatedAtUnixMs: completedAt
          });
          entry.expiresAt = completedAt + RICH_TEXT_MENTION_MISSING_TTL_MS;
          emit({
            name: "mention_resolve_completed",
            providerId: entry.identity.providerId,
            outcome: "missing",
            cacheStatus: previousReady ? "stale" : "miss",
            durationMs: Math.max(0, completedAt - startedAt)
          });
        }
        notify();
        return entry.snapshot;
      })
      .catch(() => {
        if (disposed) return entry.snapshot;
        const completedAt = now();
        if (previousReady) {
          entry.snapshot = previousReady;
        } else {
          entry.snapshot = Object.freeze({
            state: "error",
            updatedAtUnixMs: completedAt
          });
        }
        entry.expiresAt = completedAt + RICH_TEXT_MENTION_ERROR_RETRY_MS;
        emit({
          name: "mention_resolve_completed",
          providerId: entry.identity.providerId,
          outcome: "error",
          cacheStatus: previousReady ? "stale" : "miss",
          durationMs: Math.max(0, completedAt - startedAt)
        });
        notify();
        return entry.snapshot;
      })
      .finally(() => {
        entry.inFlight = undefined;
        const needsTrailingResolve =
          !disposed &&
          (entry.invalidatedWhileInFlight ||
            entry.revision !== requestRevision);
        entry.invalidatedWhileInFlight = false;
        if (needsTrailingResolve) {
          void startResolve(entry);
        }
      });
    entry.inFlight = promise;
    return promise;
  };

  const service: RichTextMentionService = {
    listProviders: registry.listProviders,
    getProvider: registry.getProvider,
    listTriggerConfigs: registry.listTriggerConfigs,
    async query(queryInput) {
      const startedAt = now();
      try {
        const matches = await registry.query(queryInput);
        emit({
          name: "mention_query_completed",
          providerId: "*",
          outcome: "success",
          cacheStatus: "miss",
          durationMs: Math.max(0, now() - startedAt)
        });
        return matches;
      } catch (error) {
        emit({
          name: "mention_query_completed",
          providerId: "*",
          outcome: "error",
          cacheStatus: "miss",
          durationMs: Math.max(0, now() - startedAt)
        });
        throw error;
      }
    },
    resolve(identity) {
      const entry = getOrCreateEntry(identity);
      const currentTime = now();
      if (
        entry.snapshot.state !== "idle" &&
        entry.snapshot.state !== "loading" &&
        currentTime < entry.expiresAt
      ) {
        emit({
          name: "mention_resolve_completed",
          providerId: entry.identity.providerId,
          outcome:
            entry.snapshot.state === "ready"
              ? "success"
              : entry.snapshot.state === "missing"
                ? "missing"
                : "error",
          cacheStatus: "hit",
          durationMs: 0
        });
        return Promise.resolve(entry.snapshot);
      }
      if (entry.inFlight) {
        return entry.snapshot.state === "ready"
          ? Promise.resolve(entry.snapshot)
          : entry.inFlight;
      }
      if (entry.snapshot.state === "ready") {
        void startResolve(entry);
        return Promise.resolve(entry.snapshot);
      }
      return startResolve(entry);
    },
    getSnapshot(identity) {
      const key = createRichTextMentionIdentityKey(identity);
      const entry = entries.get(key);
      if (!entry) return idleSnapshot;
      entry.lastAccess = now();
      return entry.snapshot;
    },
    invalidate(selector) {
      if (disposed) return;
      const normalizedProviderId = selector?.providerId?.trim();
      const normalizedEntityId = selector?.entityId?.trim();
      const entriesToRefresh: MentionCacheEntry[] = [];
      let invalidated = 0;
      for (const entry of entries.values()) {
        if (
          normalizedProviderId &&
          entry.identity.providerId !== normalizedProviderId
        ) {
          continue;
        }
        if (
          normalizedEntityId &&
          entry.identity.entityId !== normalizedEntityId
        ) {
          continue;
        }
        if (
          selector?.workspaceId &&
          entry.identity.scope?.workspaceId !== selector.workspaceId
        ) {
          continue;
        }
        entry.revision += 1;
        entry.expiresAt = 0;
        if (entry.inFlight) entry.invalidatedWhileInFlight = true;
        if (entry.subscriberCount > 0 && !entry.inFlight) {
          entriesToRefresh.push(entry);
        }
        invalidated += 1;
      }
      emit({
        name: "mention_cache_invalidated",
        providerId: normalizedProviderId ?? "*",
        outcome: "success",
        cacheStatus: "invalidated",
        durationMs: 0
      });
      if (invalidated > 0) notify();
      for (const entry of entriesToRefresh) void startResolve(entry);
    },
    subscribe(listener, identity) {
      if (disposed) return () => {};
      listeners.add(listener);
      const entry = identity ? getOrCreateEntry(identity) : undefined;
      if (entry) entry.subscriberCount += 1;
      return () => {
        listeners.delete(listener);
        if (entry) {
          entry.subscriberCount = Math.max(0, entry.subscriberCount - 1);
          evictIfNeeded();
        }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      entries.clear();
    }
  };

  return service;
}
