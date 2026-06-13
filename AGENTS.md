# AGENTS.md

## Project overview

`tutti` is a monorepo for a local-first desktop product.

Top-level areas:

- `apps/desktop`: Electron shell, renderer UI, preload bridge, and desktop integration
- `config`: repository-owned default sources used to generate runtime defaults
- `services/tuttid`: long-running local daemon and primary business core
- `packages/clients/*`: shared domain-specific clients
- `packages/configs/*`: shared TypeScript and formatting config

Repository rule of thumb:

- business logic belongs in `services/tuttid`
- UI and desktop integration belong in `apps/desktop`
- code moves into `packages/` only when there is a real shared boundary

## Setup commands

- Install workspace dependencies: `pnpm install`
- Check local prerequisites: `pnpm setup:dev`
- Check only the pinned Go lint tool version: `pnpm check:golangci-version`
- Install pinned `golangci-lint` locally before running `pnpm lint:go` or `pnpm check:full`: `pnpm install:golangci-lint`
- Build all packages and the daemon: `pnpm build`
- Run the desktop app in development: `pnpm dev:desktop`
- Typecheck the workspace: `pnpm typecheck`

## Routing guide

Read the closest `AGENTS.md` before editing files in that area:

- `apps/desktop/*` -> [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md)
- `services/tuttid/*` -> [services/tuttid/AGENTS.md](services/tuttid/AGENTS.md)
- `packages/ui/*` -> [packages/ui/AGENTS.md](packages/ui/AGENTS.md)
- `packages/*` -> [packages/AGENTS.md](packages/AGENTS.md)

Use this root file for repository-wide defaults only. Keep area-specific instructions in the nearest subdirectory document.

## Repository-wide rules

- `apps/desktop` must not become a second business core
- `services/tuttid` owns business rules, durable local state, and domain workflows
- business-code files must stay at or below `800` lines; once a file crosses that limit, prefer functional decomposition or refactoring before adding more logic
- do not create vague packages such as `shared`, `common`, `utils`, or `client-sdk`
- published workspace packages use the npm scope `@tutti-os/*`; keep package manifests, import paths, docs, and release configuration aligned with that scope
- user-visible copy must be controlled through the relevant i18n layer; do not add or change product UI text, dialog text, empty states, status labels, or user-facing error messages as hardcoded single-language strings
- change `services/tuttid/api/openapi/tuttid.v1.yaml` before changing daemon HTTP request or response contracts
- keep environment-variable growth deliberate: supported override variables must be documented in the matching durable convention docs
- update the matching document in `docs/conventions` when structural rules change
- when a fix resolves a recurring bug pattern or debugging trap, capture the durable note in `docs/conventions/troubleshooting.md`

## Testing defaults

- For daemon changes, run `pnpm lint:go` and `cd services/tuttid && go test ./... && go build ./...`
- For desktop or shared TypeScript changes, run `pnpm lint:ts` and `pnpm typecheck`
- For desktop-facing behavior changes, also run `pnpm --filter @tutti-os/desktop build`
- For user-visible copy or locale-resource changes, run `pnpm check:i18n`
- For shared UI boundary changes such as `@tutti-os/ui-system` exports, CSS rules, or SVG/icon usage rules, run `pnpm check:ui-boundaries`
- For shared default-source changes under `config/tutti.defaults.json`, run `pnpm generate:defaults` and `pnpm check:defaults-generated`
- Run `pnpm lint` when a change spans both TypeScript and Go surfaces

## Development workflow defaults

- local hooks are managed with `husky`
- `pre-commit` currently runs `pnpm exec lint-staged`, `pnpm check:ui-boundaries:staged`, and `pnpm check:renderer-boundaries:staged`
- `pre-push` currently runs `pnpm check:full`
- when changing repository-managed checks, update the matching durable rule in `docs/conventions/local-git-hooks.md`

## Conflict-heavy workflows

When handling merge, rebase, cherry-pick, or manual conflict resolution in this
repository, prioritize:

1. `using-git-worktrees`
2. `conflict-resolver`
3. `receiving-code-review`
4. `gh-address-comments` when PR review comments are involved
5. `gh-fix-ci` when CI fails after the resolution

### Conflict rules

1. Do not blindly resolve source-code conflicts with `--ours` or `--theirs`
   unless a human explicitly requests that strategy.
2. For each conflicted hunk, identify both branch intents before choosing a
   resolution.
3. Prefer preserving both valid behaviors over selecting one side wholesale.
4. For high-risk files, inspect the final merged result, not only the branch
   diff.
5. If the merge result changes files that are out of scope for the branch
   summary or commit messages, call that out explicitly before proceeding.
6. If conflict meaning is unclear, stop and ask for clarification instead of
   guessing.

### High-risk conflict surfaces

Treat conflicts in these files and surfaces as manual-review-required:

- `apps/desktop/src/main/bootstrap.ts`,
  `apps/desktop/src/main/desktopAppServices.ts`,
  `apps/desktop/src/main/desktopAppLifecycle.ts`, and
  `apps/desktop/src/main/desktopHostServices.ts`
- desktop window, preload, IPC, and shared contract boundaries under
  `apps/desktop/src/main/windows/`, `apps/desktop/src/preload/`,
  `apps/desktop/src/main/ipc/`, and `apps/desktop/src/shared/contracts/`
- renderer app roots, window composition shells, and route/layout surfaces under
  `apps/desktop/src/renderer/src/app/`
- daemon API contracts and generated boundaries under
  `services/tuttid/api/openapi/` and `packages/clients/*`
- release and CI workflows under `.github/workflows/`
- shared test harnesses, desktop bootstrap tests, auth entry points, and runtime
  startup paths

### Required post-conflict checks

After resolving conflicts, inspect the final result and run the lowest
meaningful verification:

- `git diff --name-only --diff-filter=U`
- `git show -m --stat HEAD` for merge commits or equivalent file-level review
- targeted checks for the changed surface
- broader verification when ownership or runtime impact is unclear

Repository minimum checks for desktop or shared TypeScript conflict resolution:

- `pnpm lint:ts`
- `pnpm typecheck`
- `pnpm --filter @tutti-os/desktop test` when desktop lifecycle, host access,
  preload, IPC, or update-access helpers changed
- `pnpm --filter @tutti-os/desktop build` when desktop-facing behavior changed

Repository minimum checks for daemon conflict resolution:

- `pnpm lint:go`
- `cd services/tuttid && go test ./... && go build ./...`

### Skill setup

Skill requirements in `AGENTS.md` do not auto-install anything. If a required
skill is missing, report it and prefer a checked-in repository setup helper when
one exists rather than repeating ad hoc install commands.

## Local state defaults

Daemon-owned local state uses one root convention:

- production default: `~/.tutti`
- development default: `~/.tutti-dev`

Do not add new daemon-owned files directly under `$HOME`.

## Reference documents

- [docs/architecture/README.md](docs/architecture/README.md)
- [docs/architecture/desktop-backend-access.md](docs/architecture/desktop-backend-access.md)
- [docs/architecture/desktop-transport.md](docs/architecture/desktop-transport.md)
- [docs/architecture/desktop-windows.md](docs/architecture/desktop-windows.md)
- [docs/architecture/project-structure.md](docs/architecture/project-structure.md)
- [docs/conventions/README.md](docs/conventions/README.md)
- [docs/conventions/api-contracts.md](docs/conventions/api-contracts.md)
- [docs/conventions/desktop-layering.md](docs/conventions/desktop-layering.md)
- [docs/conventions/desktop-visual-language.md](docs/conventions/desktop-visual-language.md)
- [docs/conventions/local-git-hooks.md](docs/conventions/local-git-hooks.md)
- [docs/conventions/logging.md](docs/conventions/logging.md)
- [docs/conventions/tuttid-layering.md](docs/conventions/tuttid-layering.md)
- [docs/conventions/runtime-overrides.md](docs/conventions/runtime-overrides.md)
- [docs/conventions/static-analysis.md](docs/conventions/static-analysis.md)
- [docs/conventions/troubleshooting.md](docs/conventions/troubleshooting.md)
- [packages/ui/system/ui-system.md](packages/ui/system/ui-system.md)
- [docs/conventions/workspace-domain.md](docs/conventions/workspace-domain.md)
- [docs/conventions/local-state-storage.md](docs/conventions/local-state-storage.md)
