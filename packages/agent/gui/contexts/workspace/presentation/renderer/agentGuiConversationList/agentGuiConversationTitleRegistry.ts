/**
 * Workspace-scoped registry of the latest server-confirmed conversation
 * titles.
 *
 * Every server response that carries a session title (rename ack, rail
 * section pages, session snapshots) reports into this registry; every
 * projection that renders a title (conversation list store summaries, rail
 * section rows, detail header via the list store) reads through it. Titles
 * therefore have a single reconciliation point and the rail and detail
 * header can never disagree.
 *
 * Entries are versioned by the server-reported session `updatedAtUnixMs`
 * (newest wins; ties prefer the incoming report). An entry is a bridge over
 * stale durable snapshots only: the list store prunes it once a durable
 * refresh reports the same title with an equal-or-newer timestamp.
 */

import {
  resolveAgentGUIExplicitConversationTitle,
  type AgentGUIConversationTitleFallback,
  type AgentGUIResolvedProvider
} from "../../../../../shared/agentConversationTitleProjection";

export interface AgentGUIConversationTitleReport {
  conversationId: string;
  title: string;
  updatedAtUnixMs: number;
}

export interface AgentGUIConversationServerTitle {
  title: string;
  updatedAtUnixMs: number;
}

type TitleApplyTarget = {
  id: string;
  provider: AgentGUIResolvedProvider;
  title: string;
  titleFallback?: AgentGUIConversationTitleFallback;
  updatedAtUnixMs: number;
};

const EMPTY_TITLES: ReadonlyMap<string, AgentGUIConversationServerTitle> =
  new Map();

const titlesByWorkspaceId = new Map<
  string,
  Map<string, AgentGUIConversationServerTitle>
>();
// Frozen-per-version snapshots so useSyncExternalStore consumers get a
// referentially stable map between changes.
const snapshotsByWorkspaceId = new Map<
  string,
  ReadonlyMap<string, AgentGUIConversationServerTitle>
>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function reportAgentGUIConversationServerTitles(
  workspaceId: string,
  reports: readonly AgentGUIConversationTitleReport[]
): void {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId || reports.length === 0) {
    return;
  }
  let titles = titlesByWorkspaceId.get(normalizedWorkspaceId);
  let changed = false;
  for (const report of reports) {
    const conversationId = report.conversationId.trim();
    const title = report.title.trim();
    if (!conversationId || !title) {
      continue;
    }
    const existing = titles?.get(conversationId);
    if (existing && existing.updatedAtUnixMs > report.updatedAtUnixMs) {
      continue;
    }
    if (
      existing &&
      existing.title === title &&
      existing.updatedAtUnixMs === report.updatedAtUnixMs
    ) {
      continue;
    }
    if (!titles) {
      titles = new Map();
      titlesByWorkspaceId.set(normalizedWorkspaceId, titles);
    }
    titles.set(conversationId, {
      title,
      updatedAtUnixMs: report.updatedAtUnixMs
    });
    changed = true;
  }
  if (changed) {
    snapshotsByWorkspaceId.delete(normalizedWorkspaceId);
    notify();
  }
}

export function getAgentGUIConversationServerTitles(
  workspaceId: string
): ReadonlyMap<string, AgentGUIConversationServerTitle> {
  const normalizedWorkspaceId = workspaceId.trim();
  const titles = titlesByWorkspaceId.get(normalizedWorkspaceId);
  if (!titles || titles.size === 0) {
    return EMPTY_TITLES;
  }
  const cached = snapshotsByWorkspaceId.get(normalizedWorkspaceId);
  if (cached) {
    return cached;
  }
  const snapshot: ReadonlyMap<string, AgentGUIConversationServerTitle> =
    new Map(titles);
  snapshotsByWorkspaceId.set(normalizedWorkspaceId, snapshot);
  return snapshot;
}

export function subscribeAgentGUIConversationServerTitles(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Decides whether a registry entry should replace an item's current title.
 *
 * Placeholder items (provider label or generic fallback, i.e. no explicit
 * title) always take an explicit registry title — something beats nothing,
 * regardless of timestamps, because session `updatedAt` moves with activity
 * and is not a title version. Items that already carry an explicit title
 * only yield to entries that are at least as new; a strictly newer item
 * represents durable data that outran the registry and wins.
 */
function shouldApplyServerTitle(
  item: TitleApplyTarget,
  entry: AgentGUIConversationServerTitle
): boolean {
  const explicitTitle = resolveAgentGUIExplicitConversationTitle(item);
  if (explicitTitle === entry.title) {
    return false;
  }
  if (explicitTitle && item.updatedAtUnixMs > entry.updatedAtUnixMs) {
    return false;
  }
  return true;
}

/**
 * Returns `items` with registry titles applied. Pure and identity-stable:
 * unaffected items are returned unchanged, and the input array is returned
 * when nothing applies.
 */
export function applyAgentGUIConversationServerTitles<
  T extends TitleApplyTarget
>(workspaceId: string, items: T[]): T[] {
  const titles = titlesByWorkspaceId.get(workspaceId.trim());
  if (!titles || titles.size === 0 || items.length === 0) {
    return items;
  }
  let changed = false;
  const next = items.map((item) => {
    const entry = titles.get(item.id);
    if (!entry || !shouldApplyServerTitle(item, entry)) {
      return item;
    }
    changed = true;
    return {
      ...item,
      title: entry.title,
      titleFallback: null,
      updatedAtUnixMs: Math.max(item.updatedAtUnixMs, entry.updatedAtUnixMs)
    };
  });
  return changed ? next : items;
}

/**
 * Drops registry entries that `items` (durable data) has confirmed or
 * outrun. Call from non-render refresh paths only.
 */
export function pruneAgentGUIConversationServerTitles(
  workspaceId: string,
  items: readonly TitleApplyTarget[]
): void {
  const normalizedWorkspaceId = workspaceId.trim();
  const titles = titlesByWorkspaceId.get(normalizedWorkspaceId);
  if (!titles || titles.size === 0 || items.length === 0) {
    return;
  }
  let changed = false;
  for (const item of items) {
    const entry = titles.get(item.id);
    if (!entry) {
      continue;
    }
    const explicitTitle = resolveAgentGUIExplicitConversationTitle(item);
    const confirmed =
      explicitTitle === entry.title &&
      item.updatedAtUnixMs >= entry.updatedAtUnixMs;
    const outran =
      explicitTitle !== null && item.updatedAtUnixMs > entry.updatedAtUnixMs;
    if (confirmed || outran) {
      titles.delete(item.id);
      changed = true;
    }
  }
  if (changed) {
    if (titles.size === 0) {
      titlesByWorkspaceId.delete(normalizedWorkspaceId);
    }
    snapshotsByWorkspaceId.delete(normalizedWorkspaceId);
    notify();
  }
}

export function removeAgentGUIConversationServerTitles(
  workspaceId: string,
  conversationIds: readonly string[]
): void {
  const normalizedWorkspaceId = workspaceId.trim();
  const titles = titlesByWorkspaceId.get(normalizedWorkspaceId);
  if (!titles || conversationIds.length === 0) {
    return;
  }
  let changed = false;
  for (const conversationId of conversationIds) {
    if (titles.delete(conversationId.trim())) {
      changed = true;
    }
  }
  if (changed) {
    if (titles.size === 0) {
      titlesByWorkspaceId.delete(normalizedWorkspaceId);
    }
    snapshotsByWorkspaceId.delete(normalizedWorkspaceId);
    notify();
  }
}

// Clears entries only; listeners (e.g. the conversation list store's
// module-scope subscription) stay attached across test resets.
export function resetAgentGUIConversationServerTitlesForTests(): void {
  titlesByWorkspaceId.clear();
  snapshotsByWorkspaceId.clear();
}
