#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const USAGE = `Usage: node ./.codex/skills/tutti-architecture-review/scripts/build-review-scope.mjs [options]

Options:
  --input <path>     Read candidate paths from a JSON file.
  --output <path>    Write the normalized scope JSON to a file instead of stdout.
  --help             Show this help.
`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const candidateInput = readCandidateInput(options.input);
  const scope = buildScope(candidateInput);
  const output = `${JSON.stringify(scope, null, 2)}\n`;

  if (!options.output) {
    process.stdout.write(output);
    return;
  }

  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  process.stderr.write(`Wrote review scope to ${outputPath}\n`);
}

function parseArgs(args) {
  const options = {
    input: null,
    output: null,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--input") {
      options.input = requireValue(args, (index += 1), "--input");
    } else if (arg === "--output") {
      options.output = requireValue(args, (index += 1), "--output");
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
    }
  }

  if (!options.help && !options.input) {
    throw new Error("--input is required");
  }

  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function readCandidateInput(path) {
  const inputPath = resolve(path);
  const parsed = JSON.parse(readFileSync(inputPath, "utf8"));

  if (parsed.version !== 1) {
    throw new Error(`Unsupported candidate input version: ${parsed.version}`);
  }
  if (!Array.isArray(parsed.candidates)) {
    throw new Error("Candidate input must define a candidates array");
  }

  return {
    version: parsed.version,
    query: String(parsed.query ?? "").trim(),
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
      : [],
    candidates: parsed.candidates.map(normalizeCandidate).filter(Boolean)
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;

  const normalizedPath = normalizePath(candidate.path);
  if (!normalizedPath) return null;

  return {
    path: normalizedPath,
    reason: String(candidate.reason ?? "").trim()
  };
}

function buildScope(candidateInput) {
  const candidateMap = new Map();

  for (const candidate of candidateInput.candidates) {
    const existing = candidateMap.get(candidate.path);
    if (existing) {
      if (candidate.reason && !existing.reason.includes(candidate.reason)) {
        existing.reason = [existing.reason, candidate.reason]
          .filter(Boolean)
          .join("; ");
      }
      continue;
    }
    candidateMap.set(candidate.path, { ...candidate });
  }

  const normalizedCandidates = [...candidateMap.values()];
  const directoryGroups = new Map();
  const fileCandidates = [];

  for (const candidate of normalizedCandidates) {
    if (isDirectoryPath(candidate.path)) {
      const directoryPath = ensureDirectoryPath(candidate.path);
      addDirectoryCandidate(directoryGroups, directoryPath, candidate);
      continue;
    }
    fileCandidates.push(candidate);
  }

  const ancestorCounts = countDirectoryAncestors(fileCandidates);

  for (const candidate of fileCandidates) {
    const directoryPath =
      findDeepestContainingDirectory(
        [...directoryGroups.keys()],
        candidate.path
      ) ??
      findDeepestKeywordScopedAncestor(
        candidate.path,
        ancestorCounts,
        candidateInput.keywords
      );

    if (!directoryPath) continue;
    addDirectoryCandidate(directoryGroups, directoryPath, candidate);
  }

  const scopes = [];

  for (const group of directoryGroups.values()) {
    if (
      group.sourcePaths.size === 1 &&
      !isDirectoryCandidateSource(group.path, group.sourcePaths)
    ) {
      const onlyPath = [...group.sourcePaths][0];
      const [reason] = [...group.reasons];
      scopes.push({
        path: onlyPath,
        kind: "file",
        reason: reason ?? `candidate path matched under ${group.path}`,
        sourcePaths: [onlyPath]
      });
      continue;
    }

    scopes.push({
      path: group.path,
      kind: "directory",
      reason:
        [...group.reasons][0] ??
        `multiple candidate paths matched in ${group.path}`,
      sourcePaths: [...group.sourcePaths].sort()
    });
  }

  const coveredPaths = new Set(
    [...directoryGroups.values()].flatMap((group) => [...group.sourcePaths])
  );

  for (const candidate of fileCandidates) {
    if (coveredPaths.has(candidate.path)) continue;
    scopes.push({
      path: candidate.path,
      kind: "file",
      reason: candidate.reason || "candidate path matched",
      sourcePaths: [candidate.path]
    });
  }

  const prunedScopes = pruneNestedScopes(scopes)
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, 8);

  return {
    version: 1,
    query: candidateInput.query,
    keywords: candidateInput.keywords,
    strategy: "agent-expanded-path-candidates",
    scopes: prunedScopes
  };
}

function addDirectoryCandidate(directoryGroups, directoryPath, candidate) {
  const existing = directoryGroups.get(directoryPath) ?? {
    kind: "directory",
    path: directoryPath,
    reasons: new Set(),
    sourcePaths: new Set()
  };
  if (candidate.reason) existing.reasons.add(candidate.reason);
  existing.sourcePaths.add(candidate.path);
  directoryGroups.set(directoryPath, existing);
}

function countDirectoryAncestors(fileCandidates) {
  const counts = new Map();

  for (const candidate of fileCandidates) {
    for (const ancestor of ancestorDirectories(candidate.path)) {
      counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
    }
  }

  return counts;
}

function ancestorDirectories(path) {
  const directories = [];
  let current = parentDirectoryPath(path);

  while (current) {
    directories.push(current);
    current = parentDirectoryPath(current.slice(0, -1));
  }

  return directories;
}

function findDeepestContainingDirectory(directoryPaths, candidatePath) {
  return [...directoryPaths]
    .filter((directoryPath) => candidatePath.startsWith(directoryPath))
    .sort((left, right) => right.length - left.length)[0];
}

function findDeepestKeywordScopedAncestor(path, ancestorCounts, keywords) {
  return (
    ancestorDirectories(path).find(
      (ancestor) =>
        (ancestorCounts.get(ancestor) ?? 0) > 1 &&
        pathSegmentMatchesKeywords(ancestor, keywords)
    ) ?? null
  );
}

function pathSegmentMatchesKeywords(path, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return false;

  const segment = path.replace(/\/+$/, "").split("/").at(-1)?.toLowerCase();
  if (!segment) return false;

  return keywords.some((keyword) => {
    const normalizedKeyword = String(keyword).trim().toLowerCase();
    return normalizedKeyword && segment.includes(normalizedKeyword);
  });
}

function pruneNestedScopes(scopes) {
  const directories = scopes.filter((scope) => scope.kind === "directory");

  return scopes.filter((scope) => {
    if (scope.kind === "directory") return true;
    return !directories.some((directoryScope) =>
      scope.path.startsWith(directoryScope.path)
    );
  });
}

function isDirectoryCandidateSource(path, sourcePaths) {
  return [...sourcePaths].some((sourcePath) => sourcePath === path);
}

function parentDirectoryPath(path) {
  const trimmed = path.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash === -1) return null;
  return `${trimmed.slice(0, lastSlash + 1)}`;
}

function normalizePath(path) {
  if (typeof path !== "string") return "";
  const normalized = path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  if (!normalized) return "";
  return normalized.endsWith("/")
    ? ensureDirectoryPath(normalized)
    : normalized;
}

function ensureDirectoryPath(path) {
  return path.endsWith("/") ? path : `${path}/`;
}

function isDirectoryPath(path) {
  return path.endsWith("/");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
