# Review Scope Contract

`build-review-scope.mjs` and `plan-review.mjs --scope-file` communicate through a stable JSON contract.

Keep this contract small and deterministic:

- the main agent owns module-phrase interpretation and repository search
- `build-review-scope.mjs` owns normalization, deduplication, and scope shrinking
- `plan-review.mjs` owns review planning inside the supplied scope

## Candidate Input

The main agent may gather candidate paths however it wants, then write a candidate file for `build-review-scope.mjs`.

Required shape:

```json
{
  "version": 1,
  "query": "workspace module",
  "keywords": ["workspace", "workspaces"],
  "candidates": [
    {
      "path": "apps/desktop/src/renderer/features/workspaces/index.ts",
      "reason": "filename matched workspaces"
    }
  ]
}
```

Rules:

- `version` must be `1`
- `query` is the user-facing module phrase or review request
- `keywords` is an optional list of agent-expanded path keywords
- `candidates[].path` is repository-relative and uses `/`
- directory candidates should end with `/`
- `reason` should be short and explain why the candidate was included

## Normalized Scope Output

`build-review-scope.mjs` emits the normalized scope consumed by `plan-review.mjs --scope-file`.

```json
{
  "version": 1,
  "query": "workspace module",
  "keywords": ["workspace", "workspaces"],
  "strategy": "agent-expanded-path-candidates",
  "scopes": [
    {
      "path": "apps/desktop/src/renderer/features/workspaces/",
      "kind": "directory",
      "reason": "filename matched workspaces",
      "sourcePaths": [
        "apps/desktop/src/renderer/features/workspaces/index.ts",
        "apps/desktop/src/renderer/features/workspaces/services/internal/load.ts"
      ]
    }
  ]
}
```

Rules:

- `version` must be `1`
- `strategy` describes how the scope was produced, not how the planner should behave
- `scopes[].kind` is `directory` or `file`
- `scopes[].path` is repository-relative and normalized
- `directory` scope paths end with `/`
- `sourcePaths` records the candidate paths that were collapsed into the scope

## Planner Output Metadata

When `plan-review.mjs` consumes a scope file, the generated task package exposes a structured `reviewScope` block plus compact workflow hints:

```json
{
  "workflowEntry": {
    "scopeFile": "/tmp/tutti-review-scope.json",
    "scopeMode": "auto",
    "scopeSelectionMode": "diff-intersection",
    "scopeSummary": "workspace module: 1 scope, mode auto, selection diff-intersection"
  },
  "reviewScope": {
    "query": "workspace module",
    "keywords": ["workspace", "workspaces"],
    "strategy": "agent-expanded-path-candidates",
    "scopeMode": "auto",
    "selectionMode": "diff-intersection",
    "scopeCount": 1,
    "scopes": [
      {
        "path": "apps/desktop/src/renderer/features/workspaces/",
        "kind": "directory"
      }
    ]
  }
}
```

Interpretation:

- `scopeMode` is the planner mode requested by the caller, such as `auto` or `static-only`
- `selectionMode` is the actual planner choice, such as `diff-intersection`, `scope-fallback`, or `static-only`
- `scopeSummary` is only a convenience string for the main agent
- `reviewScope` is the structured source of truth
