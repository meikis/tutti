import type { RichTextMentionIdentity } from "../types/mention.ts";

export interface NormalizedRichTextMentionIdentity extends RichTextMentionIdentity {
  providerId: string;
  entityId: string;
  scope?: Readonly<Record<string, string>>;
}

export function canonicalizeRichTextMentionScope(
  scope: RichTextMentionIdentity["scope"]
): string {
  if (!scope) {
    return "{}";
  }

  const sortedScope = Object.fromEntries(
    Object.entries(scope).sort(([left], [right]) => left.localeCompare(right))
  );
  return JSON.stringify(sortedScope);
}

export function normalizeRichTextMentionIdentity(
  identity: RichTextMentionIdentity
): NormalizedRichTextMentionIdentity {
  const providerId = identity.providerId.trim();
  const entityId = identity.entityId.trim();
  if (!providerId) {
    throw new Error("Rich text mention provider id is required.");
  }
  if (!entityId) {
    throw new Error("Rich text mention entity id is required.");
  }

  const scopeEntries = Object.entries(identity.scope ?? {}).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  return {
    providerId,
    entityId,
    label: identity.label,
    ...(scopeEntries.length > 0
      ? { scope: Object.freeze(Object.fromEntries(scopeEntries)) }
      : {})
  };
}

export function createRichTextMentionIdentityKey(
  identity: RichTextMentionIdentity
): string {
  const normalized = normalizeRichTextMentionIdentity(identity);
  return `${normalized.providerId}\0${normalized.entityId}\0${canonicalizeRichTextMentionScope(normalized.scope)}`;
}
