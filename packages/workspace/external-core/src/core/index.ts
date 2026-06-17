import {
  tuttiExternalAtProviderIds,
  type TuttiExternalAtProviderId,
  type TuttiExternalAtQueryInput,
  type TuttiExternalFileOpenInput,
  type TuttiExternalFileSelectInput
} from "../contracts/index.ts";

export { tuttiExternalAtProviderIds } from "../contracts/index.ts";

export const tuttiExternalAtMaxResultsLimit = 50;
export const tuttiExternalAtDefaultMaxResults = 20;

export function normalizeTuttiExternalAtQueryInput(
  input: unknown
): TuttiExternalAtQueryInput {
  if (!isRecord(input)) {
    throw new Error("at.query input must be an object.");
  }

  const keywordValue = input.keyword;
  if (typeof keywordValue !== "string") {
    throw new Error("at.query keyword is required.");
  }

  return {
    keyword: keywordValue,
    maxResults: normalizeMaxResults(input.maxResults),
    providers: normalizeProviders(input.providers)
  };
}

export function normalizeTuttiExternalFileSelectInput(
  input: unknown
): TuttiExternalFileSelectInput {
  if (input === undefined || input === null) {
    return {};
  }
  if (!isRecord(input)) {
    throw new Error("files.select input must be an object.");
  }
  return {
    multiple: input.multiple === true
  };
}

export function normalizeTuttiExternalFileOpenInput(
  input: unknown
): TuttiExternalFileOpenInput {
  if (!isRecord(input)) {
    throw new Error("files.open input must be an object.");
  }
  if (typeof input.path !== "string" || input.path.trim() === "") {
    throw new Error("files.open path is required.");
  }
  const mode = normalizeFileOpenMode(input.mode);
  return {
    ...(mode ? { mode } : {}),
    ...(typeof input.mtimeMs === "number" || input.mtimeMs === null
      ? { mtimeMs: input.mtimeMs }
      : {}),
    ...(typeof input.name === "string" && input.name.trim() !== ""
      ? { name: input.name.trim() }
      : {}),
    path: input.path.trim(),
    ...(typeof input.sizeBytes === "number" || input.sizeBytes === null
      ? { sizeBytes: input.sizeBytes }
      : {})
  };
}

export function isTuttiExternalAtProviderId(
  value: unknown
): value is TuttiExternalAtProviderId {
  return (
    typeof value === "string" &&
    tuttiExternalAtProviderIds.includes(value as TuttiExternalAtProviderId)
  );
}

function normalizeMaxResults(value: unknown): number {
  if (value === undefined || value === null) {
    return tuttiExternalAtDefaultMaxResults;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("at.query maxResults must be a finite number.");
  }
  const integer = Math.floor(value);
  if (integer < 0) {
    throw new Error("at.query maxResults must be greater than or equal to 0.");
  }
  return Math.min(integer, tuttiExternalAtMaxResultsLimit);
}

function normalizeProviders(
  value: unknown
): readonly TuttiExternalAtProviderId[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("at.query providers must be an array.");
  }
  const providers: TuttiExternalAtProviderId[] = [];
  for (const provider of value) {
    if (!isTuttiExternalAtProviderId(provider)) {
      throw new Error("at.query providers contains an unsupported provider.");
    }
    if (!providers.includes(provider)) {
      providers.push(provider);
    }
  }
  return providers;
}

function normalizeFileOpenMode(
  value: unknown
): TuttiExternalFileOpenInput["mode"] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "auto" || value === "preview" || value === "reveal") {
    return value;
  }
  throw new Error("files.open mode is unsupported.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
