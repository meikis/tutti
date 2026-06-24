import assert from "node:assert/strict";
import test from "node:test";
import type {
  ReferenceScope,
  WorkspaceFileReferenceAdapter
} from "@tutti-os/workspace-file-reference/contracts";
import type { WorkspaceUserProject } from "@tutti-os/workspace-user-project/contracts";
import type { IWorkspaceUserProjectService } from "../workspace-user-project/index.ts";
import {
  USER_PROJECT_REFERENCE_SOURCE_ID,
  createUserProjectReferenceSource
} from "./userProjectReferenceSource.ts";

const scope: ReferenceScope = { workspaceId: "workspace-1" };

test("user project source exposes projects as sidebar groups and root entries", async () => {
  const source = createUserProjectReferenceSource({
    adapter: {},
    label: "Projects",
    workspaceUserProjectService: createWorkspaceUserProjectService([
      userProject("project-1", "/Users/local/repo", "Repo"),
      userProject("project-2", "/Users/local/app", "App")
    ])
  });

  assert.equal(await source.isAvailable(scope), true);
  assert.deepEqual(
    source
      .listSidebarGroups?.(scope)
      .map((node) => [node.ref.sourceId, node.ref.nodeId, node.displayName]),
    [
      [USER_PROJECT_REFERENCE_SOURCE_ID, "/Users/local/repo", "Repo"],
      [USER_PROJECT_REFERENCE_SOURCE_ID, "/Users/local/app", "App"]
    ]
  );

  const root = await source.listChildren(scope, { node: null });
  assert.deepEqual(
    root.entries.map((node) => node.ref.nodeId),
    ["/Users/local/repo", "/Users/local/app"]
  );
  assert.equal(root.ordered, true);
});

test("user project source locates a project and lists files through the file adapter", async () => {
  let listedPath: string | null | undefined;
  const adapter: WorkspaceFileReferenceAdapter = {
    async listDirectory(input) {
      listedPath = input.path;
      return {
        directoryPath: input.path ?? "/Users/local",
        entries: [
          {
            displayName: "README.md",
            kind: "file",
            path: `${input.path}/README.md`
          }
        ]
      };
    }
  };
  const source = createUserProjectReferenceSource({
    adapter,
    label: "Projects",
    workspaceUserProjectService: createWorkspaceUserProjectService([
      userProject("project-1", "/Users/local/repo", "Repo")
    ])
  });

  assert.deepEqual(
    await source.locateTarget?.(scope, { projectId: "project-1" }),
    [
      {
        sourceId: USER_PROJECT_REFERENCE_SOURCE_ID,
        nodeId: "/Users/local/repo"
      }
    ]
  );

  const children = await source.listChildren(scope, {
    node: {
      sourceId: USER_PROJECT_REFERENCE_SOURCE_ID,
      nodeId: "/Users/local/repo"
    }
  });

  assert.equal(listedPath, "/Users/local/repo");
  assert.deepEqual(
    children.entries.map((node) => [node.ref.nodeId, node.displayName]),
    [["/Users/local/repo/README.md", "README.md"]]
  );
});

test("user project source search scopes to the selected project", async () => {
  let observedWithin: string | undefined;
  const adapter: WorkspaceFileReferenceAdapter = {
    async searchReferences(input) {
      observedWithin = input.within;
      return [
        {
          displayName: "README.md",
          kind: "file",
          path: `${input.within}/README.md`
        }
      ];
    }
  };
  const source = createUserProjectReferenceSource({
    adapter,
    label: "Projects",
    workspaceUserProjectService: createWorkspaceUserProjectService([
      userProject("project-1", "/Users/local/repo", "Repo")
    ])
  });

  const result = await source.search?.(scope, {
    query: "read",
    withinNodeId: "/Users/local/repo"
  });

  assert.equal(observedWithin, "/Users/local/repo");
  assert.deepEqual(
    result?.entries.map((entry) => entry.ref.nodeId),
    ["/Users/local/repo/README.md"]
  );
});

function userProject(
  id: string,
  path: string,
  label: string
): WorkspaceUserProject {
  return {
    createdAtUnixMs: 1,
    id,
    label,
    path,
    updatedAtUnixMs: 1
  };
}

function createWorkspaceUserProjectService(
  projects: WorkspaceUserProject[]
): IWorkspaceUserProjectService {
  return {
    _serviceBrand: undefined,
    async checkProjectPath(path) {
      return { exists: true, isDirectory: true, path };
    },
    async createProject(name) {
      return userProject("created", `/Users/local/${name}`, name);
    },
    async ensureLoaded() {},
    async getDefaultSelection() {
      return null;
    },
    getRevision() {
      return 1;
    },
    getSnapshot() {
      return {
        error: null,
        initialized: true,
        isLoading: false,
        projects,
        revision: 1
      };
    },
    isNoProjectPath() {
      return false;
    },
    rememberNoProjectPath() {},
    async prepareSelection() {
      return {
        isSelectedPathMissing: false,
        projects,
        selection: { kind: "none" }
      };
    },
    async refresh() {},
    async registerProjectPath(path) {
      return userProject("registered", path, "Registered");
    },
    async removeProjectPath() {},
    async rememberDefaultSelection() {},
    async selectDirectory() {
      return null;
    },
    store: {
      error: null,
      initialized: true,
      isLoading: false,
      projects,
      revision: 1
    } as IWorkspaceUserProjectService["store"],
    subscribe() {
      return () => {};
    }
  };
}
