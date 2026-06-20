export function messageSummaryText(value: unknown): string | null {
  const text = structuredTextValue(value);
  return text && text.trim() ? text.trim() : null;
}

function structuredTextValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() ? value : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map(structuredTextValue)
      .filter((part): part is string => Boolean(part?.trim()));
    return parts.length > 0 ? parts.join("\n") : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return firstNonEmptyString(
    stringValue(record.text),
    "content" in record ? structuredTextValue(record.content) : null
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function firstNonEmptyString(...values: Array<string | null>): string | null {
  return (
    values.find((value) => value !== null && value.trim().length > 0) ?? null
  );
}
