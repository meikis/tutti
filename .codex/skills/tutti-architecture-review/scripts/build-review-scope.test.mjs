import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "build-review-scope.mjs"
);

test("collapses sibling file candidates into directory scopes", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "tutti-review-scope-"));
  const inputPath = join(workspaceRoot, "candidates.json");

  await writeWorkspaceFile(
    workspaceRoot,
    "apps/desktop/src/renderer/features/workspaces/index.ts",
    "export const workspaces = true;\n"
  );
  await writeWorkspaceFile(
    workspaceRoot,
    "apps/desktop/src/renderer/features/workspaces/services/internal/load.ts",
    "export const load = true;\n"
  );
  await writeWorkspaceFile(
    workspaceRoot,
    "services/tuttid/service/workspaces/manager.go",
    "package workspaces\n"
  );

  await writeFile(
    inputPath,
    JSON.stringify(
      {
        version: 1,
        query: "workspace module",
        keywords: ["workspace", "workspaces"],
        candidates: [
          {
            path: "apps/desktop/src/renderer/features/workspaces/index.ts",
            reason: "filename matched workspaces"
          },
          {
            path: "apps/desktop/src/renderer/features/workspaces/services/internal/load.ts",
            reason: "path segment matched workspaces"
          },
          {
            path: "services/tuttid/service/workspaces/manager.go",
            reason: "path segment matched workspaces"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath],
    {
      cwd: workspaceRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);

  const scope = JSON.parse(result.stdout);
  assert.equal(scope.strategy, "agent-expanded-path-candidates");
  assert.deepEqual(
    scope.scopes.map((entry) => entry.path),
    [
      "apps/desktop/src/renderer/features/workspaces/",
      "services/tuttid/service/workspaces/manager.go"
    ]
  );
  assert.equal(scope.scopes[0].kind, "directory");
  assert.equal(scope.scopes[0].sourcePaths.length, 2);
  assert.equal(scope.scopes[1].kind, "file");
});

test("removes nested file scopes when a directory scope already covers them", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "tutti-review-scope-"));
  const inputPath = join(workspaceRoot, "candidates.json");

  await writeWorkspaceFile(
    workspaceRoot,
    "packages/workspace/file-manager/src/index.ts",
    "export * from './ui';\n"
  );

  await writeFile(
    inputPath,
    JSON.stringify(
      {
        version: 1,
        query: "file manager",
        keywords: ["file-manager"],
        candidates: [
          {
            path: "packages/workspace/file-manager/src/",
            reason: "directory matched file-manager"
          },
          {
            path: "packages/workspace/file-manager/src/index.ts",
            reason: "file matched file-manager"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath],
    {
      cwd: workspaceRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);

  const scope = JSON.parse(result.stdout);
  assert.equal(scope.scopes.length, 1);
  assert.equal(scope.scopes[0].path, "packages/workspace/file-manager/src/");
  assert.equal(scope.scopes[0].kind, "directory");
});

test("does not collapse to a broad parent when only the parent is shared", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "tutti-review-scope-"));
  const inputPath = join(workspaceRoot, "candidates.json");

  await writeWorkspaceFile(
    workspaceRoot,
    "apps/desktop/src/renderer/features/workspaces/index.ts",
    "export const workspaces = true;\n"
  );
  await writeWorkspaceFile(
    workspaceRoot,
    "apps/desktop/src/renderer/features/settings/index.ts",
    "export const settings = true;\n"
  );

  await writeFile(
    inputPath,
    JSON.stringify(
      {
        version: 1,
        query: "workspace module",
        keywords: ["workspace", "workspaces"],
        candidates: [
          {
            path: "apps/desktop/src/renderer/features/workspaces/index.ts",
            reason: "filename matched workspaces"
          },
          {
            path: "apps/desktop/src/renderer/features/settings/index.ts",
            reason: "neighbor feature candidate"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath],
    {
      cwd: workspaceRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);

  const scope = JSON.parse(result.stdout);
  assert.deepEqual(
    scope.scopes.map((entry) => entry.path),
    [
      "apps/desktop/src/renderer/features/settings/index.ts",
      "apps/desktop/src/renderer/features/workspaces/index.ts"
    ]
  );
});

async function writeWorkspaceFile(workspaceRoot, path, content) {
  const absolutePath = join(workspaceRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
