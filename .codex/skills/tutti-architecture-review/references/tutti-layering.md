# Tutti Layering Reference

This is a compact reference for architecture reviewers. The durable source of truth remains the repository docs under `docs/architecture` and `docs/conventions`.

## Repository Shape

- `apps/desktop` owns Electron shell, renderer UI, preload bridge, OS integration, and daemon supervision.
- `services/tuttid` owns business rules, durable local state, domain workflows, and persistence.
- `packages/*` exists only for real shared seams with narrow names.
- `config` contains machine-consumable repository defaults, not user settings or documentation.
- `tools` contains repository support scripts, not permanent product behavior.
- Do not create vague packages such as `shared`, `common`, `utils`, or `client-sdk`.

Review questions:

- Does the change put business logic in `services/tuttid` rather than `apps/desktop`?
- Does a new package have multiple real consumers and a narrow interface?
- Does a new directory represent durable ownership, or is it speculative structure?
- Does a helper module have depth, or is it a shallow pass-through?
- When a workspace package includes frontend orchestration, is it still host-reusable rather than coupled to one concrete product integration?

## Desktop Layering

Authoritative docs:

- `docs/conventions/desktop-layering.md`
- `apps/desktop/AGENTS.md`
- `docs/conventions/desktop-visual-language.md`
- `docs/conventions/ui-system.md`

Allowed ownership:

- `src/main`: Electron-specific capabilities, app bootstrap, windows, IPC registration, transport endpoint resolution, daemon supervision, updates, logging.
- `src/preload`: renderer-facing typed desktop SDK; hides IPC channel names.
- `src/renderer`: consumes typed preload APIs; owns React UI and renderer-local feature services.
- `src/shared`: narrow desktop-local bridge contracts and i18n resources.

Hard checks:

- `main` must not implement business workflows or durable domain state.
- `preload` must not expose a generic `invoke(channel, payload)` surface.
- `renderer` must not import Electron APIs, construct daemon clients, or resolve transport endpoints.
- renderer UI must not import another feature's `services/internal/**`.
- renderer must use `@tutti-os/ui-system` instead of recreating design tokens, icons, or primitives locally.
- user-visible copy belongs in the i18n layer.

Preferred renderer feature shape:

```text
renderer/src/features/<feature>/
  index.ts
  services/
    <feature>Service.interface.ts
    <feature>Types.ts
    register<Feature>Services.ts
    internal/
      <feature>Service.ts
      <feature>Store.ts
      <feature>Model.ts
      adapters/
  ui/
```

## Tuttid Layering

Authoritative docs:

- `docs/conventions/tuttid-layering.md`
- `services/tuttid/AGENTS.md`
- `docs/conventions/api-contracts.md`
- `docs/conventions/local-state-storage.md`

Ownership:

- `main.go`: process bootstrap only.
- `wiring.go`: composition root; may know concrete implementations.
- `app`: process lifecycle around HTTP server.
- `server`: HTTP server assembly and middleware.
- `api`: request decoding, response encoding, HTTP status selection, route dispatch, generated DTOs.
- `service`: use-case orchestration, domain validation, DTO translation, collaborator calls.
- `biz`: small transport-agnostic domain models/rules shared across layers.
- `data`: concrete persistence adapters, SQLite, migrations, file-backed repositories.
- `integration`: cross-layer black-box tests.
- `types`: cross-domain support only.

Dependency direction:

```text
main -> wiring -> app/server/api -> service -> data -> biz
```

Hard checks:

- `data` must not depend on `api`.
- `biz` must not depend on `api`, `service`, or `data`.
- `api` should not know concrete persistence details except narrow sentinel error mapping.
- `service` should not perform direct SQL or HTTP response writing.
- simple behavior should not be split into a full domain slice before the seam is real.

Important exception:

- `WorkbenchSnapshot*` is a repository-owned shared contract synchronized from
  `packages/workbench/snapshot`.
- Reusing the synchronized Go snapshot contract in `service/workspace` for
  validation and canonicalization is allowed when it avoids a parallel
  hand-maintained mirror.
- The exception does not move HTTP decoding, status-code mapping, or route-local
  validation ownership out of `api`.

## Contract And Generated Source Rules

- Change `services/tuttid/api/openapi/tuttid.v1.yaml` before changing daemon HTTP request or response contracts.
- `WorkbenchSnapshot*` is the main exception: change
  `packages/workbench/snapshot/src/schema.json` first, then sync the OpenAPI and
  Go generated artifacts that depend on it.
- Before adding local event buses, event centers, product pub-sub routes, or
  duplicate WebSocket coordination, check whether the shared business event
  stream and its `global`, `desktop`, or `workspace` scope modules already own
  the seam.
- Shared default-source changes under `config/tutti.defaults.json` require generated outputs to be refreshed.
- Supported environment override growth must be documented in `docs/conventions/runtime-overrides.md`.
- User-visible copy and locale-resource changes should go through the relevant i18n layer.
- Repository-managed checks and hooks should update the durable convention docs when their rules change.

## Review Severity

- `P0`: architecture break that blocks the change from working or shipping.
- `P1`: hard layering or contract violation that will spread business logic or break callers.
- `P2`: real maintainability issue: shallow module, misplaced ownership, test locality loss, or likely future duplication.
- `P3`: speculative deepening opportunity; useful but not required for this change.
