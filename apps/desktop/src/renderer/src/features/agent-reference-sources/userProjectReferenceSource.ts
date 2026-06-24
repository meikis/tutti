import { resolveWorkspaceUserProjectDisplayLabel } from "@tutti-os/workspace-user-project/core";
import type { WorkspaceUserProject } from "@tutti-os/workspace-user-project/contracts";
import type {
  ListChildrenInput,
  ListChildrenResult,
  NodeRef,
  ReferenceNode,
  ReferencePreview,
  ReferenceScope,
  ReferenceSourceService,
  SearchInput,
  SearchResult,
  SelectedReference,
  WorkspaceFileReference,
  WorkspaceFileReferenceAdapter
} from "@tutti-os/workspace-file-reference/contracts";
import { normalizeReferenceNodeKind } from "@tutti-os/workspace-file-reference/core";
import type { IWorkspaceUserProjectService } from "../workspace-user-project/index.ts";

export const USER_PROJECT_REFERENCE_SOURCE_ID = "user-project";

export function createUserProjectReferenceSource(input: {
  adapter: WorkspaceFileReferenceAdapter;
  label: string;
  order?: number;
  workspaceUserProjectService: IWorkspaceUserProjectService;
}): ReferenceSourceService {
  const { adapter, workspaceUserProjectService } = input;

  async function listProjects(): Promise<WorkspaceUserProject[]> {
    await workspaceUserProjectService.ensureLoaded();
    return workspaceUserProjectService.getSnapshot().projects;
  }

  function currentProjects(): WorkspaceUserProject[] {
    return workspaceUserProjectService.getSnapshot().projects;
  }

  function projectToNode(project: WorkspaceUserProject): ReferenceNode {
    return {
      ref: {
        sourceId: USER_PROJECT_REFERENCE_SOURCE_ID,
        nodeId: project.path
      },
      kind: "folder",
      displayName: resolveWorkspaceUserProjectDisplayLabel(project),
      contextLabel: project.path,
      hasChildren: true
    };
  }

  function referenceToNode(ref: WorkspaceFileReference): ReferenceNode {
    const kind = normalizeReferenceNodeKind(ref.kind);
    return {
      ref: {
        sourceId: USER_PROJECT_REFERENCE_SOURCE_ID,
        nodeId: ref.path
      },
      kind,
      displayName: ref.displayName?.trim() || basename(ref.path),
      ...(kind === "folder" ? { hasChildren: true } : {}),
      ...(ref.sizeBytes == null ? {} : { sizeBytes: ref.sizeBytes }),
      ...(ref.mtimeMs == null ? {} : { mtimeMs: ref.mtimeMs })
    };
  }

  function nodeToReference(node: ReferenceNode): WorkspaceFileReference {
    return { path: node.ref.nodeId, kind: node.kind };
  }

  return {
    metadata: {
      id: USER_PROJECT_REFERENCE_SOURCE_ID,
      label: input.label,
      order: input.order ?? -1
    },
    capabilities: {
      searchable: true,
      previewable: true,
      paginated: false,
      navigable: false,
      filterable: true
    },

    async isAvailable() {
      return (await listProjects()).length > 0;
    },

    listSidebarGroups(): ReferenceNode[] {
      return currentProjects().map(projectToNode);
    },

    async listChildren(
      scope: ReferenceScope,
      { node }: ListChildrenInput
    ): Promise<ListChildrenResult> {
      if (!node) {
        return {
          entries: (await listProjects()).map(projectToNode),
          nextCursor: null,
          ordered: true
        };
      }

      if (!adapter.listDirectory) {
        return { entries: [], nextCursor: null };
      }
      const listing = await adapter.listDirectory({
        workspaceId: scope.workspaceId,
        path: node.nodeId
      });
      return {
        entries: listing.entries.map(referenceToNode),
        nextCursor: null
      };
    },

    async locateTarget(
      _scope: ReferenceScope,
      params: Record<string, string>
    ): Promise<NodeRef[] | null> {
      const projectId = params.projectId?.trim() ?? "";
      const projectPath = normalizePath(params.projectPath);
      const project = (await listProjects()).find((item) => {
        if (projectId && item.id === projectId) {
          return true;
        }
        return projectPath !== "" && normalizePath(item.path) === projectPath;
      });
      if (!project) {
        return null;
      }
      return [
        {
          sourceId: USER_PROJECT_REFERENCE_SOURCE_ID,
          nodeId: project.path
        }
      ];
    },

    async search(
      scope: ReferenceScope,
      { query, filters, limit, signal, withinNodeId }: SearchInput
    ): Promise<SearchResult> {
      if (!adapter.searchReferences) {
        return { entries: [], nextCursor: null };
      }
      const projects = withinNodeId
        ? [{ path: withinNodeId }]
        : await listProjects();
      const entries: ReferenceNode[] = [];
      const seen = new Set<string>();
      const resultLimit = limit ?? 30;
      for (const project of projects) {
        if (entries.length >= resultLimit) {
          break;
        }
        const refs = await adapter.searchReferences({
          workspaceId: scope.workspaceId,
          query,
          ...(filters && filters.length > 0 ? { filters } : {}),
          within: project.path,
          limit: resultLimit,
          ...(signal ? { signal } : {})
        });
        for (const ref of refs) {
          const key = ref.path;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          entries.push(referenceToNode(ref));
          if (entries.length >= resultLimit) {
            break;
          }
        }
      }
      return { entries, nextCursor: null };
    },

    async open(_scope: ReferenceScope, node: ReferenceNode): Promise<void> {
      await adapter.openReference?.(nodeToReference(node));
    },

    async readPreview(
      scope: ReferenceScope,
      node: ReferenceNode
    ): Promise<ReferencePreview | null> {
      if (!adapter.readReferencePreview) {
        return null;
      }
      return adapter.readReferencePreview({
        workspaceId: scope.workspaceId,
        reference: nodeToReference(node)
      });
    },

    resolveSelection(node: ReferenceNode): SelectedReference {
      return {
        path: node.ref.nodeId,
        kind: node.kind,
        ...(node.displayName ? { displayName: node.displayName } : {})
      };
    }
  };
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

function normalizePath(path: string | null | undefined): string {
  return path?.trim().replaceAll("\\", "/").replace(/\/+$/, "") ?? "";
}
