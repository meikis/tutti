# @tutti-os/ui-rich-text

Host-agnostic rich text foundations for Tutti frontend packages.

This package is the new home for the repository's rich text work. It is
intended to own:

- document normalization and plain-text extraction
- generic markdown-link helpers and mention-link serialization
- editor and readonly surfaces
- plugin and mention runtime contracts
- rich text extension registration

This package should not own workspace-domain semantics such as `/workspace/...`
path policy, workspace-file markdown meaning, host file lookup, or product
workflow-specific reference rules. Those stay with the owning workspace-domain
package or host adapter.

Current migration status:

- `src/internal/ported-source/*` is a direct snapshot of the old top-level
  `richText/` directory so we can refactor from the current code instead of
  redesigning from memory.
- `src/core/richTextDocument.ts` is the first promoted, host-agnostic surface
  extracted from that snapshot.
- editor wrappers and current node extensions are intentionally not public yet
  because they still depend on app-specific imports and legacy host seams.
- the package root export is intentionally narrow; `core`, `editor`, `plugins`,
  and `types` remain the explicit public subpaths

Known transitional seam:

- current editor and readonly surfaces still embed workspace-reference semantics
  such as `/workspace/...` link handling and workspace reference presentation
- treat that behavior as transitional implementation, not as the intended
  public contract of `@tutti-os/ui-rich-text`
- before adding another host-specific inline reference protocol here, stop and
  re-evaluate the generic rich-text reference seam across real consumers

Current refactor plan:

1. Promote host-agnostic document helpers from `ported-source` into `core`.
2. Define a stable plugin contract for `@`, `#`, and future inline token
   triggers.
3. Rebuild editor wrappers around injected host adapters instead of app-local
   imports.
4. Keep domain-specific reference protocols in their owning packages and only
   promote the generic rich-text seam here when it is truly host-agnostic.

## Mention protocol draft

The first stable plugin contract in this package is the `@` mention protocol.

Boundary split:

- the editor core owns trigger detection, selection state, keyboard handling,
  insertion lifecycle, and storage shape
- the host plugin owns query behavior, suggestion copy, insert mapping, and
  reverse resolution

Stable stored attrs:

```ts
type RichTextMentionAttrs = {
  trigger: "@";
  plugin: string;
  entityId: string;
  label: string;
  href?: string;
  kind?: string;
  version?: string;
  meta?: Readonly<Record<string, string>>;
};
```

Why this shape:

- `plugin` identifies which host capability owns the token
- `entityId` is the durable identity and must not depend on visible copy
- `label` is the last rendered fallback text so readonly and indexing can still
  work without a roundtrip
- `href`, `kind`, `version`, and `meta` are optional extension points for host
  routing and compatibility

Plugin contract:

```ts
interface RichTextMentionPlugin<TItem = unknown, TResolved = unknown> {
  id: string;
  trigger?: "@";
  query: (
    input: RichTextMentionQueryInput
  ) => Promise<readonly TItem[]> | readonly TItem[];
  getItemKey: (item: TItem) => string;
  getItemLabel: (item: TItem) => string;
  getItemSubtitle?: (item: TItem) => string | null | undefined;
  getItemKeywords?: (item: TItem) => readonly string[] | undefined;
  toMention: (item: TItem) => RichTextMentionInsert;
  renderText?: (attrs: RichTextMentionAttrs) => string;
  resolveMention?: (
    input: RichTextMentionResolveInput
  ) =>
    | Promise<RichTextResolvedMention<TResolved>>
    | RichTextResolvedMention<TResolved>;
}
```

Interpretation:

- `query` decides what `@` can mention
- `getItemLabel` and `getItemSubtitle` decide the suggestion copy
- `toMention` maps a chosen item into the stored attrs shape
- `renderText` lets the host override readonly text such as `@Alice` vs
  `@Alice Chen`
- `resolveMention` maps stored attrs into a fixed display state plus an optional
  resolved entity payload

Display-state protocol:

```ts
type RichTextMentionRenderState = "active" | "missing" | "disabled" | "loading";

type RichTextResolvedMention<TResolved = unknown> = {
  state: RichTextMentionRenderState;
  label?: string;
  tooltip?: string;
  href?: string;
  entity?: TResolved;
};
```

Interpretation:

- `active` means normal styling and normal interaction
- `missing` means the original resource no longer exists and should render in a
  muted non-interactive style
- `disabled` means the resource still exists but the current host should not
  allow normal interaction, for example because of permissions or product rules
- `loading` is a temporary host-controlled resolution state

This package intentionally keeps the public status model visual and generic.
Business-specific reasons such as deleted, archived, forbidden, or offline stay
inside the host plugin and collapse into one of the fixed render states above.

Helpers now exported:

- `createRichTextMentionPlugin`
- `createRichTextMentionAttrs`
- `createRichTextMentionRegistry`
- `createRichTextLinkMarkdown`
- `getRichTextMentionDisplayText`
- `isRichTextMentionAttrs`
- `normalizeRichTextContent`
- `resolveRichTextMentionView`

Runtime surfaces now exported:

- `RichTextAtTextarea`
- `RichTextMentionReadonly`

Current runtime behavior:

- the registry aggregates multiple `@` plugins in declaration order
- query results are flattened into a shared result shape with prebuilt mention
  attrs
- resolve falls back to `missing` when the plugin no longer exists
- readonly rendering maps the resolved state into one fixed visual shape family
  with overridable labels, tooltips, and click handling
