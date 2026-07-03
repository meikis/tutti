import type {
  WorkspaceFileDirectoryExpansionState,
  WorkspaceFileEntry
} from "../services/workspaceFileManagerTypes.ts";
import {
  sortWorkspaceFileEntriesForArrangeMode,
  type WorkspaceFileManagerArrangeMode
} from "./workspaceFileManagerArrangeMode.ts";

export type WorkspaceFileManagerVisibleTreeRow =
  | {
      depth: number;
      entry: WorkspaceFileEntry;
      expanded: boolean;
      expandable: boolean;
      kind: "entry";
      loadingChildren: boolean;
    }
  | {
      depth: number;
      key: string;
      kind: "feedback";
      parentPath: string;
      status: "empty" | "error" | "loading";
      message?: string;
    };

export function buildWorkspaceFileManagerVisibleTreeRows(input: {
  arrangeMode: WorkspaceFileManagerArrangeMode;
  directoryExpansionByPath: Record<
    string,
    WorkspaceFileDirectoryExpansionState
  >;
  entries: readonly WorkspaceFileEntry[];
  expandedDirectoryPaths: Record<string, boolean>;
}): WorkspaceFileManagerVisibleTreeRow[] {
  return appendWorkspaceFileManagerVisibleTreeRows({
    ...input,
    depth: 0
  });
}

export function collectWorkspaceFileManagerVisibleTreeEntries(
  rows: readonly WorkspaceFileManagerVisibleTreeRow[]
): WorkspaceFileEntry[] {
  return rows.flatMap((row) => (row.kind === "entry" ? [row.entry] : []));
}

/**
 * Finds the nearest visible entry row before/after `fromPath` in tree order,
 * skipping feedback rows (loading/empty/error placeholders are not
 * selectable). Powers ArrowUp/ArrowDown keyboard navigation.
 */
export function findWorkspaceFileManagerAdjacentEntryPath(
  rows: readonly WorkspaceFileManagerVisibleTreeRow[],
  fromPath: string,
  direction: 1 | -1
): string | null {
  const fromIndex = rows.findIndex(
    (row) => row.kind === "entry" && row.entry.path === fromPath
  );
  if (fromIndex === -1) {
    return null;
  }
  for (
    let index = fromIndex + direction;
    index >= 0 && index < rows.length;
    index += direction
  ) {
    const row = rows[index];
    if (row && row.kind === "entry") {
      return row.entry.path;
    }
  }
  return null;
}

/**
 * Finds the first visible row immediately below an expanded directory row
 * (its first child entry, or a loading/empty/error feedback row). Powers
 * ArrowRight moving focus into an already-expanded directory.
 */
export function findWorkspaceFileManagerFirstChildRow(
  rows: readonly WorkspaceFileManagerVisibleTreeRow[],
  parentPath: string
): WorkspaceFileManagerVisibleTreeRow | null {
  const parentIndex = rows.findIndex(
    (row) => row.kind === "entry" && row.entry.path === parentPath
  );
  if (parentIndex === -1) {
    return null;
  }
  return rows[parentIndex + 1] ?? null;
}

/**
 * Finds the nearest ancestor entry row for `fromPath` (the row directly one
 * depth level up). Powers ArrowLeft collapsing/exiting back to the parent
 * directory.
 */
export function findWorkspaceFileManagerParentEntryPath(
  rows: readonly WorkspaceFileManagerVisibleTreeRow[],
  fromPath: string
): string | null {
  const fromIndex = rows.findIndex(
    (row) => row.kind === "entry" && row.entry.path === fromPath
  );
  if (fromIndex === -1) {
    return null;
  }
  const fromRow = rows[fromIndex];
  const fromDepth = fromRow?.depth ?? 0;
  if (fromDepth === 0) {
    return null;
  }
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && row.kind === "entry" && row.depth === fromDepth - 1) {
      return row.entry.path;
    }
  }
  return null;
}

function appendWorkspaceFileManagerVisibleTreeRows(input: {
  arrangeMode: WorkspaceFileManagerArrangeMode;
  depth: number;
  directoryExpansionByPath: Record<
    string,
    WorkspaceFileDirectoryExpansionState
  >;
  entries: readonly WorkspaceFileEntry[];
  expandedDirectoryPaths: Record<string, boolean>;
}): WorkspaceFileManagerVisibleTreeRow[] {
  const sortedEntries = sortWorkspaceFileEntriesForArrangeMode(
    input.entries,
    input.arrangeMode
  );
  const rows: WorkspaceFileManagerVisibleTreeRow[] = [];

  for (const entry of sortedEntries) {
    const expandable = entry.kind === "directory" && entry.hasChildren;
    const expanded = expandable
      ? input.expandedDirectoryPaths[entry.path] === true
      : false;
    const childState = input.directoryExpansionByPath[entry.path];
    rows.push({
      depth: input.depth,
      entry,
      expanded,
      expandable,
      kind: "entry",
      loadingChildren: childState?.isLoading ?? false
    });

    if (!expanded) {
      continue;
    }

    if (!childState || childState.isLoading) {
      rows.push({
        depth: input.depth + 1,
        key: `${entry.path}:loading`,
        kind: "feedback",
        parentPath: entry.path,
        status: "loading"
      });
      continue;
    }

    if (childState.error) {
      rows.push({
        depth: input.depth + 1,
        key: `${entry.path}:error`,
        kind: "feedback",
        message: childState.error,
        parentPath: entry.path,
        status: "error"
      });
      continue;
    }

    if (childState.loaded && childState.entries.length === 0) {
      rows.push({
        depth: input.depth + 1,
        key: `${entry.path}:empty`,
        kind: "feedback",
        parentPath: entry.path,
        status: "empty"
      });
      continue;
    }

    rows.push(
      ...appendWorkspaceFileManagerVisibleTreeRows({
        ...input,
        depth: input.depth + 1,
        entries: childState.entries
      })
    );
  }

  return rows;
}
