import {
  workspaceAppManifestSchemaVersion,
  type WorkspaceAppManifest
} from "../contracts/manifest.ts";
import { isWorkspaceAppId, normalizeWorkspaceAppId } from "./appIdentity.ts";

const appWindowMinWidth = 280;
const appWindowMinHeight = 160;
const appWindowMaxWidth = 1600;
const appWindowMaxHeight = 1200;

export type WorkspaceAppManifestValidationIssueCode =
  | "manifest.notObject"
  | "manifest.schemaVersion"
  | "manifest.appId"
  | "manifest.name"
  | "manifest.version"
  | "manifest.description"
  | "manifest.icon"
  | "manifest.runtime"
  | "manifest.window"
  | "manifest.author"
  | "manifest.references"
  | "manifest.tags"
  | "manifest.localizationInfo";

export interface WorkspaceAppManifestValidationIssue {
  readonly code: WorkspaceAppManifestValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface WorkspaceAppManifestValidationResult {
  readonly manifest?: WorkspaceAppManifest;
  readonly issues: readonly WorkspaceAppManifestValidationIssue[];
  readonly valid: boolean;
}

export function validateWorkspaceAppManifest(
  value: unknown
): WorkspaceAppManifestValidationResult {
  const issues: WorkspaceAppManifestValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      issues: [
        {
          code: "manifest.notObject",
          message: "Manifest must be an object.",
          path: "$"
        }
      ],
      valid: false
    };
  }

  if (value.schemaVersion !== workspaceAppManifestSchemaVersion) {
    issues.push({
      code: "manifest.schemaVersion",
      message: `schemaVersion must be ${workspaceAppManifestSchemaVersion}.`,
      path: "$.schemaVersion"
    });
  }

  const appId = readOptionalString(value.appId);
  if (!appId || !isWorkspaceAppId(normalizeWorkspaceAppId(appId))) {
    issues.push({
      code: "manifest.appId",
      message:
        "appId must contain lowercase letters, numbers, dots, hyphens, or underscores.",
      path: "$.appId"
    });
  }

  const name = readOptionalString(value.name);
  if (!name) {
    issues.push({
      code: "manifest.name",
      message: "name is required.",
      path: "$.name"
    });
  }

  const version = readOptionalString(value.version);
  if (!version) {
    issues.push({
      code: "manifest.version",
      message: "version is required.",
      path: "$.version"
    });
  }

  const description = readOptionalString(value.description);
  if (!description) {
    issues.push({
      code: "manifest.description",
      message: "description is required.",
      path: "$.description"
    });
  }

  const icon = validateIcon(value.icon, issues);
  const runtime = validateRuntime(value.runtime, issues);
  const window = validateWindow(value.window, issues);
  const author = validateAuthor(value.author, issues);
  const references = validateReferences(value.references, issues);
  const tags = validateTags(value.tags, issues);
  const localizationInfo = validateLocalizationInfo(
    value.localizationInfo,
    issues
  );

  if (
    issues.length > 0 ||
    !appId ||
    !name ||
    !version ||
    !description ||
    !runtime
  ) {
    return {
      issues,
      valid: false
    };
  }

  return {
    issues,
    manifest: {
      schemaVersion: workspaceAppManifestSchemaVersion,
      appId: normalizeWorkspaceAppId(appId),
      name,
      version,
      description,
      ...(icon ? { icon } : {}),
      runtime,
      ...(window ? { window } : {}),
      ...(author ? { author } : {}),
      ...(references ? { references } : {}),
      ...(tags ? { tags } : {}),
      ...(localizationInfo ? { localizationInfo } : {})
    },
    valid: true
  };
}

function validateIcon(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): WorkspaceAppManifest["icon"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "manifest.icon",
      message: "icon must be an object when provided.",
      path: "$.icon"
    });
    return undefined;
  }

  const type = value.type;
  const src = readOptionalString(value.src);
  if (type !== "asset" || !src || !isRelativePackagePath(src)) {
    issues.push({
      code: "manifest.icon",
      message: "icon must include type=asset and a relative src.",
      path: "$.icon"
    });
    return undefined;
  }

  return {
    type,
    src
  };
}

function validateRuntime(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): WorkspaceAppManifest["runtime"] | undefined {
  if (!isRecord(value)) {
    issues.push({
      code: "manifest.runtime",
      message: "runtime is required.",
      path: "$.runtime"
    });
    return undefined;
  }

  const bootstrap = readOptionalString(value.bootstrap);
  const healthcheckPath = readOptionalString(value.healthcheckPath);
  if (!bootstrap || !isRelativePackagePath(bootstrap)) {
    issues.push({
      code: "manifest.runtime",
      message: "runtime.bootstrap must be a relative package path.",
      path: "$.runtime.bootstrap"
    });
  }
  if (!healthcheckPath || !healthcheckPath.startsWith("/")) {
    issues.push({
      code: "manifest.runtime",
      message: "runtime.healthcheckPath must start with /.",
      path: "$.runtime.healthcheckPath"
    });
  }
  if (
    !bootstrap ||
    !healthcheckPath ||
    !isRelativePackagePath(bootstrap) ||
    !healthcheckPath.startsWith("/")
  ) {
    return undefined;
  }

  return {
    bootstrap,
    healthcheckPath
  };
}

function validateWindow(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): WorkspaceAppManifest["window"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "manifest.window",
      message: "window must be an object when provided.",
      path: "$.window"
    });
    return undefined;
  }

  const minimizeBehavior = value.minimizeBehavior;
  if (
    minimizeBehavior !== undefined &&
    minimizeBehavior !== "keep-mounted" &&
    minimizeBehavior !== "hibernate"
  ) {
    issues.push({
      code: "manifest.window",
      message:
        "window.minimizeBehavior must be keep-mounted or hibernate when provided.",
      path: "$.window.minimizeBehavior"
    });
    return undefined;
  }
  const minWidth = validateWindowSize(
    value.minWidth,
    "minWidth",
    appWindowMinWidth,
    appWindowMaxWidth,
    issues
  );
  const minHeight = validateWindowSize(
    value.minHeight,
    "minHeight",
    appWindowMinHeight,
    appWindowMaxHeight,
    issues
  );
  if (minWidth === null || minHeight === null) {
    return undefined;
  }

  return {
    ...(minimizeBehavior ? { minimizeBehavior } : {}),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(minWidth === undefined ? {} : { minWidth })
  };
}

function validateWindowSize(
  value: unknown,
  field: "minHeight" | "minWidth",
  minimum: number,
  maximum: number,
  issues: WorkspaceAppManifestValidationIssue[]
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push({
      code: "manifest.window",
      message: `window.${field} must be an integer between ${minimum} and ${maximum} when provided.`,
      path: `$.window.${field}`
    });
    return null;
  }
  return value;
}

function validateAuthor(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): WorkspaceAppManifest["author"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "manifest.author",
      message: "author must be an object when provided.",
      path: "$.author"
    });
    return undefined;
  }

  const name = readOptionalString(value.name);
  const url = readOptionalString(value.url);
  if (!name || (value.url !== undefined && !url)) {
    issues.push({
      code: "manifest.author",
      message: "author must include name and an optional non-empty url.",
      path: "$.author"
    });
    return undefined;
  }

  return {
    name,
    ...(url ? { url } : {})
  };
}

function validateReferences(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): WorkspaceAppManifest["references"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "manifest.references",
      message: "references must be an object when provided.",
      path: "$.references"
    });
    return undefined;
  }

  const searchEndpoint = readOptionalString(value.searchEndpoint);
  if (!searchEndpoint || !isRelativeUrlPath(searchEndpoint)) {
    issues.push({
      code: "manifest.references",
      message:
        "references.searchEndpoint must be a relative URL path without query or hash.",
      path: "$.references.searchEndpoint"
    });
    return undefined;
  }

  return { searchEndpoint };
}

function validateTags(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    issues.push({
      code: "manifest.tags",
      message: "tags must be an array when provided.",
      path: "$.tags"
    });
    return undefined;
  }

  const tags = value
    .map((tag) => readOptionalString(tag))
    .filter((tag): tag is string => Boolean(tag));
  if (tags.length !== value.length) {
    issues.push({
      code: "manifest.tags",
      message: "tags must only contain non-empty strings.",
      path: "$.tags"
    });
  }

  return Array.from(new Set(tags));
}

function validateLocalizationInfo(
  value: unknown,
  issues: WorkspaceAppManifestValidationIssue[]
): WorkspaceAppManifest["localizationInfo"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "manifest.localizationInfo",
      message: "localizationInfo must be an object when provided.",
      path: "$.localizationInfo"
    });
    return undefined;
  }

  const defaultLocale = readOptionalString(value.defaultLocale);
  if (!defaultLocale) {
    issues.push({
      code: "manifest.localizationInfo",
      message: "localizationInfo.defaultLocale is required.",
      path: "$.localizationInfo.defaultLocale"
    });
  }

  const additionalLocalesValue = value.additionalLocales;
  if (
    additionalLocalesValue !== undefined &&
    !Array.isArray(additionalLocalesValue)
  ) {
    issues.push({
      code: "manifest.localizationInfo",
      message: "localizationInfo.additionalLocales must be an array.",
      path: "$.localizationInfo.additionalLocales"
    });
    return undefined;
  }

  const seenLocales = new Set(
    defaultLocale ? [defaultLocale.toLowerCase()] : []
  );
  const additionalLocales: {
    readonly file: string;
    readonly locale: string;
  }[] = [];
  for (const [index, entry] of (additionalLocalesValue ?? []).entries()) {
    if (!isRecord(entry)) {
      issues.push({
        code: "manifest.localizationInfo",
        message: "localizationInfo.additionalLocales entries must be objects.",
        path: `$.localizationInfo.additionalLocales[${index}]`
      });
      continue;
    }

    const locale = readOptionalString(entry.locale);
    const file = readOptionalString(entry.file);
    if (!locale || !file || !isRelativePackagePath(file)) {
      issues.push({
        code: "manifest.localizationInfo",
        message:
          "localizationInfo.additionalLocales entries must include locale and a relative file path.",
        path: `$.localizationInfo.additionalLocales[${index}]`
      });
      continue;
    }

    const localeKey = locale.toLowerCase();
    if (seenLocales.has(localeKey)) {
      issues.push({
        code: "manifest.localizationInfo",
        message: "localizationInfo locales must be unique.",
        path: `$.localizationInfo.additionalLocales[${index}].locale`
      });
      continue;
    }

    seenLocales.add(localeKey);
    additionalLocales.push({ locale, file });
  }

  if (
    !defaultLocale ||
    issues.some((issue) => issue.code === "manifest.localizationInfo")
  ) {
    return undefined;
  }

  return {
    defaultLocale,
    ...(additionalLocales.length > 0 ? { additionalLocales } : {})
  };
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRelativePackagePath(value: string): boolean {
  return !value.startsWith("/") && !value.split(/[\\/]/u).includes("..");
}

function isRelativeUrlPath(value: string): boolean {
  const trimmed = value.trim();
  if (
    !trimmed ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\0") ||
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("%")
  ) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
