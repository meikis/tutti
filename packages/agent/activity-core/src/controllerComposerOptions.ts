import type { AgentActivityAdapter } from "./adapter.ts";
import { createComposerOptionsCacheCoordinator } from "./composerOptionsCache.ts";
import {
  areComposerOptionsEqual,
  cloneAgentActivityComposerOptions
} from "./controllerSnapshot.ts";
import type {
  AgentActivityComposerOptions,
  AgentActivityLoadComposerOptionsInput,
  AgentActivitySnapshot
} from "./types.ts";

export interface AgentActivityComposerOptionsController {
  load(
    input: Omit<AgentActivityLoadComposerOptionsInput, "workspaceId"> & {
      force?: boolean;
    }
  ): Promise<AgentActivityComposerOptions>;
  invalidate(input?: { providers?: readonly string[] }): void;
}

export function createAgentActivityComposerOptionsController(input: {
  adapter: AgentActivityAdapter;
  getSnapshot: () => AgentActivitySnapshot;
  updateSnapshot: (
    updater: (current: AgentActivitySnapshot) => AgentActivitySnapshot
  ) => AgentActivitySnapshot;
  workspaceId: string;
}): AgentActivityComposerOptionsController {
  const cache = createComposerOptionsCacheCoordinator();

  async function load(
    request: Omit<AgentActivityLoadComposerOptionsInput, "workspaceId"> & {
      force?: boolean;
    }
  ): Promise<AgentActivityComposerOptions> {
    const provider = request.provider.trim();
    if (!provider) {
      throw new Error("Agent composer options provider is required.");
    }
    const agentTargetId = request.agentTargetId?.trim() || null;
    const primaryCacheKey = cache.cacheKey(provider, agentTargetId);
    const requestSignature = cache.requestSignature(request);
    if (!request.force) {
      const snapshot = input.getSnapshot();
      const cached = agentTargetId
        ? snapshot.composerOptionsByAgentTargetId?.[agentTargetId]
        : snapshot.composerOptionsByProvider?.[provider];
      if (cached && cache.settledMatches(primaryCacheKey, requestSignature)) {
        return cloneAgentActivityComposerOptions(cached);
      }
    }
    const existingLoad = request.force
      ? null
      : cache.activeLoad(primaryCacheKey, requestSignature);
    if (existingLoad) {
      return existingLoad.then(cloneAgentActivityComposerOptions);
    }
    const loadVersion = cache.nextLoadVersion(primaryCacheKey);
    const pending = input.adapter
      .loadComposerOptions({
        agentTargetId,
        workspaceId: input.workspaceId,
        provider,
        cwd: request.cwd,
        settings: request.settings,
        signal: request.signal
      })
      .then((options) => {
        const normalized = cloneAgentActivityComposerOptions({
          ...options,
          provider,
          loadedAtUnixMs: options.loadedAtUnixMs || Date.now()
        });
        if (!cache.isLatest(primaryCacheKey, loadVersion)) {
          return cloneAgentActivityComposerOptions(normalized);
        }
        cache.markSettled(primaryCacheKey, requestSignature);
        input.updateSnapshot((current) => {
          const currentOptions = agentTargetId
            ? current.composerOptionsByAgentTargetId?.[agentTargetId]
            : current.composerOptionsByProvider?.[provider];
          if (
            currentOptions &&
            areComposerOptionsEqual(currentOptions, normalized)
          ) {
            return current;
          }
          return agentTargetId
            ? {
                ...current,
                composerOptionsByAgentTargetId: {
                  ...current.composerOptionsByAgentTargetId,
                  [agentTargetId]: normalized
                }
              }
            : {
                ...current,
                composerOptionsByProvider: {
                  ...current.composerOptionsByProvider,
                  [provider]: normalized
                }
              };
        });
        return cloneAgentActivityComposerOptions(normalized);
      })
      .finally(() => cache.finishActive(primaryCacheKey, pending));
    cache.markActive(primaryCacheKey, requestSignature, pending);
    return pending.then(cloneAgentActivityComposerOptions);
  }

  function invalidate(request?: { providers?: readonly string[] }): void {
    const providers = request?.providers?.length
      ? new Set(request.providers)
      : null;
    const matches = (provider: string | null | undefined): boolean =>
      providers === null || (!!provider && providers.has(provider));
    const staleKeys = new Set<string>();
    const snapshot = input.getSnapshot();
    for (const provider of Object.keys(
      snapshot.composerOptionsByProvider ?? {}
    )) {
      if (matches(provider)) staleKeys.add(cache.cacheKey(provider, null));
    }
    for (const [agentTargetId, options] of Object.entries(
      snapshot.composerOptionsByAgentTargetId ?? {}
    )) {
      if (matches(options?.provider)) {
        staleKeys.add(cache.cacheKey("", agentTargetId));
      }
    }
    for (const cacheKey of cache.settledCacheKeys()) {
      if (providers === null) {
        staleKeys.add(cacheKey);
      } else {
        for (const provider of providers) {
          if (cacheKey === cache.cacheKey(provider, null)) {
            staleKeys.add(cacheKey);
          }
        }
      }
    }
    for (const cacheKey of staleKeys) cache.invalidate(cacheKey);
  }

  return { load, invalidate };
}
