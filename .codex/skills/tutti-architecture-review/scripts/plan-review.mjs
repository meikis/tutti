#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: node ./.codex/skills/tutti-architecture-review/scripts/plan-review.mjs [options]

Options:
  --base <ref>        Compare against a base ref. Defaults to HEAD.
  --staged           Review only staged changes.
  --no-untracked     Exclude untracked files from planning.
  --scope-file <path>
                     Limit review planning to a normalized scope JSON file.
  --scope-mode <mode>
                     Scope selection mode: auto or static-only. Defaults to auto.
  --format <format>  Output format: json, markdown, or summary. Defaults to json.
  --output <path>    Write output to a file instead of stdout.
  --output-temp      Write output to an OS temp task package path.
  --from-package <path>
                     Render an existing JSON task package instead of reading git diff.
  --task <id>        Keep only one task id in the rendered package.
  --help             Show this help.
`;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reviewRules = loadReviewRules(
  resolve(scriptDir, "../references/review-rules.json")
);
const TASKS = reviewRules.tasks;
const SIGNAL_RULES = reviewRules.signals;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const outputPath = resolveOutputPath(options);
  if (options.fromPackage) {
    const packageJson = applyTaskFilter(
      readTaskPackage(options.fromPackage),
      options.taskId
    );
    const output = renderOutput(packageJson, options.format);
    writeOrPrintOutput(output, outputPath);
    return;
  }

  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  process.chdir(repoRoot);

  const scope = options.scopeFile ? readScopeFile(options.scopeFile) : null;
  const changedFiles = selectReviewFiles(
    collectChangedFiles(options),
    scope,
    options
  );
  const preflightSignals = collectPreflightSignals(changedFiles, options);
  const context = buildContext(changedFiles, preflightSignals);
  const tasks = TASKS.map((task) =>
    buildTask(task, changedFiles, preflightSignals, context)
  ).filter((task) => task.matchedFiles.length > 0);

  const packageJson = applyTaskFilter(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      repoRoot,
      baseRef: options.staged ? null : options.base,
      mode: options.staged ? "staged" : "worktree",
      includeUntracked: options.includeUntracked,
      workflowEntry: {
        packagePath: outputPath,
        fromPackage: null,
        scopeFile: scope?.path ?? null,
        scopeQuery: scope?.query ?? null,
        scopeMode: scope ? options.scopeMode : null,
        scopeSelectionMode: scope?.selectionMode ?? null,
        scopeSummary: scope ? summarizeScope(scope, options.scopeMode) : null,
        recommendedNextStep:
          "Use the tasks array as the main-agent orchestration plan. Spawn explorer sub-agents according to spawnRecommendation."
      },
      diffCommands: buildDiffCommands(options),
      crossCuttingReasons: context.crossCuttingReasons,
      reviewScope: scope
        ? buildReviewScopeMetadata(scope, options.scopeMode)
        : null,
      changedFiles,
      preflightSignals,
      tasks,
      empty: tasks.length === 0
    },
    options.taskId
  );

  const output = renderOutput(packageJson, options.format);
  writeOrPrintOutput(output, outputPath);
}

function parseArgs(args) {
  const options = {
    base: "HEAD",
    staged: false,
    includeUntracked: true,
    format: "json",
    output: null,
    outputTemp: false,
    fromPackage: null,
    scopeFile: null,
    scopeMode: "auto",
    taskId: null,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--base") {
      options.base = requireValue(args, (index += 1), "--base");
    } else if (arg === "--staged") {
      options.staged = true;
    } else if (arg === "--no-untracked") {
      options.includeUntracked = false;
    } else if (arg === "--scope-file") {
      options.scopeFile = requireValue(args, (index += 1), "--scope-file");
    } else if (arg === "--scope-mode") {
      options.scopeMode = requireValue(args, (index += 1), "--scope-mode");
      if (!["auto", "static-only"].includes(options.scopeMode)) {
        throw new Error(`Unsupported --scope-mode: ${options.scopeMode}`);
      }
    } else if (arg === "--format") {
      options.format = requireValue(args, (index += 1), "--format");
      if (!["json", "markdown", "summary"].includes(options.format)) {
        throw new Error(`Unsupported --format: ${options.format}`);
      }
    } else if (arg === "--output") {
      options.output = requireValue(args, (index += 1), "--output");
    } else if (arg === "--output-temp") {
      options.outputTemp = true;
    } else if (arg === "--from-package") {
      options.fromPackage = requireValue(args, (index += 1), "--from-package");
    } else if (arg === "--task") {
      options.taskId = requireValue(args, (index += 1), "--task");
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
    }
  }

  if (options.output && options.outputTemp) {
    throw new Error("--output and --output-temp cannot be used together");
  }

  return options;
}

function resolveOutputPath(options) {
  if (options.output) return resolve(options.output);
  if (!options.outputTemp) return null;

  const extension = options.format === "json" ? "json" : "md";
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
  return resolve(
    tmpdir(),
    `tutti-architecture-review-${timestamp}.${extension}`
  );
}

function readScopeFile(path) {
  const scopePath = resolve(path);
  const scopeJson = JSON.parse(readFileSync(scopePath, "utf8"));

  if (scopeJson.version !== 1) {
    throw new Error(`Unsupported review scope version: ${scopeJson.version}`);
  }
  if (!Array.isArray(scopeJson.scopes)) {
    throw new Error("Review scope must define a scopes array");
  }

  const scopes = scopeJson.scopes.map(normalizeScope).filter(Boolean);
  if (scopes.length === 0) {
    throw new Error("Review scope must contain at least one valid scope entry");
  }

  return {
    path: scopePath,
    query: String(scopeJson.query ?? "").trim(),
    keywords: Array.isArray(scopeJson.keywords)
      ? scopeJson.keywords
          .map((keyword) => String(keyword).trim())
          .filter(Boolean)
      : [],
    strategy: String(scopeJson.strategy ?? "").trim() || "scope-file",
    scopes,
    selectionMode: null
  };
}

function loadReviewRules(path) {
  const rules = JSON.parse(readFileSync(path, "utf8"));
  if (rules.version !== 1) {
    throw new Error(`Unsupported review rules version: ${rules.version}`);
  }
  if (!Array.isArray(rules.tasks) || !Array.isArray(rules.signals)) {
    throw new Error("Review rules must define tasks and signals arrays");
  }
  return rules;
}

function readTaskPackage(path) {
  const packagePath = resolve(path);
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

  return {
    ...packageJson,
    workflowEntry: {
      ...(packageJson.workflowEntry ?? {}),
      packagePath: packageJson.workflowEntry?.packagePath ?? packagePath,
      fromPackage: packagePath,
      recommendedNextStep:
        packageJson.workflowEntry?.recommendedNextStep ??
        "Use the tasks array as the main-agent orchestration plan. Spawn explorer sub-agents according to spawnRecommendation."
    }
  };
}

function renderOutput(packageJson, format) {
  if (format === "markdown") return renderMarkdown(packageJson);
  if (format === "summary") return renderSummary(packageJson);
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function applyTaskFilter(packageJson, taskId) {
  if (!taskId) return packageJson;

  const selectedTasks = packageJson.tasks.filter((task) => task.id === taskId);
  if (selectedTasks.length === 0) {
    const availableTaskIds = packageJson.tasks
      .map((task) => task.id)
      .join(", ");
    throw new Error(
      `Unknown --task ${taskId}. Available task ids: ${availableTaskIds || "(none)"}`
    );
  }

  return {
    ...packageJson,
    workflowEntry: {
      ...(packageJson.workflowEntry ?? {}),
      taskFilter: taskId
    },
    tasks: selectedTasks,
    empty: selectedTasks.length === 0
  };
}

function writeOrPrintOutput(output, outputPath) {
  if (!outputPath) {
    process.stdout.write(output);
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  process.stderr.write(`Wrote review task package to ${outputPath}\n`);
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function collectChangedFiles(options) {
  const diffArgs = options.staged
    ? ["diff", "--cached", "--name-status", "--find-renames", "--find-copies"]
    : [
        "diff",
        options.base,
        "--name-status",
        "--find-renames",
        "--find-copies"
      ];

  const diffOutput = git(diffArgs);
  const files = parseNameStatus(diffOutput);

  if (options.includeUntracked && !options.staged) {
    const untracked = git(["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((path) => ({
        path,
        oldPath: null,
        status: "??",
        statusText: "untracked",
        area: classifyArea(path)
      }));

    files.push(...untracked);
  }

  return dedupeByPath(files).sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

function selectReviewFiles(changedFiles, scope, options) {
  if (!scope) return changedFiles;

  if (options.scopeMode === "static-only") {
    scope.selectionMode = "static-only";
    return expandScopeFiles(scope.scopes, options);
  }

  const scopedDiffFiles = changedFiles.filter((file) =>
    scope.scopes.some((entry) => scopeContainsPath(entry, file.path))
  );
  if (scopedDiffFiles.length > 0) {
    scope.selectionMode = "diff-intersection";
    return scopedDiffFiles;
  }

  scope.selectionMode = "scope-fallback";
  return expandScopeFiles(scope.scopes, options);
}

function parseNameStatus(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0];
      const isRenameOrCopy = status.startsWith("R") || status.startsWith("C");
      const path = isRenameOrCopy ? parts[2] : parts[1];
      const oldPath = isRenameOrCopy ? parts[1] : null;

      return {
        path,
        oldPath,
        status,
        statusText: statusText(status),
        area: classifyArea(path)
      };
    });
}

function dedupeByPath(files) {
  const byPath = new Map();
  for (const file of files) {
    byPath.set(file.path, file);
  }
  return [...byPath.values()];
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== "object") return null;
  const normalizedPath = normalizeScopePath(scope.path);
  if (!normalizedPath) return null;

  const kind = scope.kind === "file" ? "file" : "directory";
  return {
    kind,
    path:
      kind === "directory"
        ? ensureDirectoryPath(normalizedPath)
        : normalizedPath
  };
}

function normalizeScopePath(path) {
  if (typeof path !== "string") return "";
  return path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

function ensureDirectoryPath(path) {
  return path.endsWith("/") ? path : `${path}/`;
}

function scopeContainsPath(scope, path) {
  if (scope.kind === "file") return path === scope.path;
  return path.startsWith(scope.path);
}

function expandScopeFiles(scopes, options) {
  const files = [];

  for (const scope of scopes) {
    const lsFilesArgs = ["ls-files", "--cached", "--", scope.path];
    if (options.includeUntracked) {
      lsFilesArgs.splice(2, 0, "--others", "--exclude-standard");
    }
    const output = git(lsFilesArgs);

    for (const path of output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)) {
      files.push({
        path,
        oldPath: null,
        status: "SC",
        statusText: "scoped",
        area: classifyArea(path)
      });
    }
  }

  return dedupeByPath(files).sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

function buildReviewScopeMetadata(scope, scopeMode) {
  return {
    query: scope.query,
    keywords: [...(scope.keywords ?? [])],
    strategy: scope.strategy ?? "scope-file",
    scopeMode,
    selectionMode: scope.selectionMode,
    scopeCount: scope.scopes.length,
    scopes: scope.scopes.map((entry) => ({
      path: entry.path,
      kind: entry.kind
    }))
  };
}

function summarizeScope(scope, scopeMode) {
  const label = scope.query || "module scope";
  const countLabel =
    scope.scopes.length === 1 ? "1 scope" : `${scope.scopes.length} scopes`;
  const selectionLabel = scope.selectionMode ?? "pending";
  return `${label}: ${countLabel}, mode ${scopeMode}, selection ${selectionLabel}`;
}

function statusText(status) {
  if (status === "A") return "added";
  if (status === "M") return "modified";
  if (status === "D") return "deleted";
  if (status === "??") return "untracked";
  if (status.startsWith("R")) return "renamed";
  if (status.startsWith("C")) return "copied";
  return "changed";
}

function classifyArea(path) {
  if (path.startsWith("apps/desktop/")) return "apps/desktop";
  if (path.startsWith("services/tuttid/")) return "services/tuttid";
  if (path.startsWith("packages/")) return "packages";
  if (path.startsWith("config/")) return "config";
  if (path.startsWith("tools/")) return "tools";
  if (path.startsWith("docs/")) return "docs";
  if (path.startsWith(".codex/")) return ".codex";
  return path.includes("/") ? path.split("/")[0] : "root";
}

function buildContext(changedFiles, preflightSignals) {
  const primaryAreas = new Set(
    changedFiles
      .filter((file) => isProductPath(file.path))
      .map((file) => {
        if (file.path.startsWith("apps/desktop/")) return "apps/desktop";
        if (file.path.startsWith("services/tuttid/")) return "services/tuttid";
        if (file.path.startsWith("packages/")) return "packages";
        if (file.path.startsWith("config/")) return "config";
        return file.area;
      })
  );

  const topLevels = new Set(
    changedFiles.map((file) => file.path.split("/")[0])
  );
  const changedPaths = new Set(changedFiles.map((file) => file.path));
  const hasDesktop = primaryAreas.has("apps/desktop");
  const hasTuttid = primaryAreas.has("services/tuttid");
  const hasPackages = primaryAreas.has("packages");
  const hasOpenApi = changedPaths.has(
    "services/tuttid/api/openapi/tuttid.v1.yaml"
  );
  const hasGeneratedClient = changedFiles.some((file) =>
    file.path.startsWith("packages/clients/tuttid-ts/src/generated/")
  );
  const hasDesktopBridge = changedFiles.some(
    (file) =>
      file.path.startsWith("apps/desktop/src/shared/contracts/") ||
      file.path.startsWith("apps/desktop/src/preload/") ||
      file.path.startsWith("apps/desktop/src/main/ipc/")
  );
  const hasPackageManifest = changedFiles.some((file) =>
    isPackageManifest(file.path)
  );
  const hasCrossImportSignal = preflightSignals.some(
    (signal) => signal.id === "cross-area-import"
  );
  const crossCuttingReasons = [
    hasDesktop && hasTuttid ? "desktop and tuttid changed together" : null,
    hasOpenApi && (hasGeneratedClient || hasDesktopBridge)
      ? "daemon contract and consumers changed together"
      : null,
    hasPackages && (hasDesktop || hasTuttid)
      ? "shared package and product area changed together"
      : null,
    hasPackageManifest ? "package manifest changed" : null,
    hasCrossImportSignal ? "cross-area import signal detected" : null
  ].filter(Boolean);

  return {
    primaryAreas,
    changedTopLevelCount: topLevels.size,
    crossCuttingReasons,
    hasCrossCuttingTrigger: crossCuttingReasons.length > 0
  };
}

function buildTask(taskDefinition, changedFiles, preflightSignals, context) {
  const matchedFiles = changedFiles.filter((file) =>
    taskMatchesFile(taskDefinition, file, context)
  );
  const matchedPathSet = new Set(matchedFiles.map((file) => file.path));
  const taskSignals = preflightSignals.filter(
    (signal) =>
      signal.taskIds.includes(taskDefinition.id) &&
      (!signal.path || matchedPathSet.has(signal.path))
  );
  const triggerReasons =
    taskDefinition.id === "cross-cutting-architecture"
      ? context.crossCuttingReasons
      : [];
  const riskLevel = calculateRiskLevel(
    taskDefinition,
    matchedFiles,
    taskSignals
  );
  const spawnRecommendation = calculateSpawnRecommendation(
    riskLevel,
    matchedFiles,
    taskSignals
  );

  return {
    id: taskDefinition.id,
    title: taskDefinition.title,
    area: taskDefinition.area,
    priority: taskDefinition.priority,
    riskLevel,
    spawnRecommendation,
    triggerReasons,
    summaryForMainAgent: summarizeTaskForMainAgent(
      taskDefinition,
      matchedFiles,
      taskSignals,
      riskLevel,
      spawnRecommendation
    ),
    matchedFiles,
    preflightSignals: taskSignals,
    referenceFiles: taskDefinition.referenceFiles,
    reviewFocus: taskDefinition.focus,
    prompt: buildPrompt(
      taskDefinition,
      matchedFiles,
      taskSignals,
      triggerReasons
    )
  };
}

function buildPrompt(
  taskDefinition,
  matchedFiles,
  preflightSignals,
  triggerReasons
) {
  const fileList = matchedFiles
    .map(
      (file) =>
        `- ${file.path}${file.oldPath ? ` (renamed from ${file.oldPath})` : ""} [${file.statusText}]`
    )
    .join("\n");
  const references = taskDefinition.referenceFiles
    .map((path) => `- ${path}`)
    .join("\n");
  const focus = taskDefinition.focus.map((item) => `- ${item}`).join("\n");
  const signalText =
    preflightSignals.length > 0
      ? preflightSignals
          .map(
            (signal) =>
              `- ${signal.severity}: ${formatSignalLocation(signal)} - ${signal.message}`
          )
          .join("\n")
      : "- None detected by the planner. Still inspect the diff directly.";
  const triggerSection =
    triggerReasons.length > 0
      ? `\n\nTrigger reasons:\n${triggerReasons.map((reason) => `- ${reason}`).join("\n")}`
      : "";

  return `You are the ${taskDefinition.title} for a tutti architecture review.

Scope:
${fileList}${triggerSection}

Read these references first, only as needed:
${references}

Review focus:
${focus}

Planner preflight signals:
${signalText}

Inspect the relevant diff directly when available. Useful commands:
- git status --short
- git diff -- <scoped-path-from-above>

If a scoped file is untracked or came from scope fallback without diff overlap, inspect the file contents directly because git diff may not show it.

Do not edit files. Report architecture findings only. Use this format:
- Severity: P0, P1, P2, or P3
- File/line: path:line when available
- Rule: the project structure or layering rule involved
- Evidence: what the diff does
- Recommendation: the smallest architecture-preserving change

If there are no findings, say "No architecture findings."`;
}

function buildDiffCommands(options) {
  if (options.staged) {
    return {
      nameStatus:
        "git diff --cached --name-status --find-renames --find-copies",
      fileDiff: "git diff --cached -- <path>"
    };
  }

  return {
    nameStatus: `git diff ${options.base} --name-status --find-renames --find-copies`,
    fileDiff: `git diff ${options.base} -- <path>`,
    untracked: "git ls-files --others --exclude-standard"
  };
}

function renderMarkdown(packageJson) {
  const lines = [
    "# Tutti Architecture Review Tasks",
    "",
    `Generated: ${packageJson.generatedAt}`,
    `Mode: ${packageJson.mode}`,
    packageJson.baseRef ? `Base ref: ${packageJson.baseRef}` : null,
    packageJson.workflowEntry?.packagePath
      ? `Task package: ${packageJson.workflowEntry.packagePath}`
      : null,
    packageJson.workflowEntry?.fromPackage
      ? `Loaded from package: ${packageJson.workflowEntry.fromPackage}`
      : null,
    packageJson.workflowEntry?.scopeFile
      ? `Scope file: ${packageJson.workflowEntry.scopeFile}`
      : null,
    packageJson.workflowEntry?.scopeQuery
      ? `Scope query: ${packageJson.workflowEntry.scopeQuery}`
      : null,
    packageJson.workflowEntry?.scopeMode
      ? `Scope mode: ${packageJson.workflowEntry.scopeMode}`
      : null,
    packageJson.workflowEntry?.scopeSelectionMode
      ? `Scope selection: ${packageJson.workflowEntry.scopeSelectionMode}`
      : null,
    packageJson.workflowEntry?.scopeSummary
      ? `Scope summary: ${packageJson.workflowEntry.scopeSummary}`
      : null,
    `Changed files: ${packageJson.changedFiles.length}`,
    `Preflight signals: ${packageJson.preflightSignals.length}`,
    (packageJson.crossCuttingReasons ?? []).length > 0
      ? `Cross-cutting reasons: ${packageJson.crossCuttingReasons.join("; ")}`
      : null,
    `Tasks: ${packageJson.tasks.length}`,
    ""
  ].filter(Boolean);

  if (packageJson.tasks.length === 0) {
    lines.push("No architecture review tasks matched the current diff.", "");
    return lines.join("\n");
  }

  for (const task of packageJson.tasks) {
    lines.push(
      `## ${task.title}`,
      "",
      `Risk: ${task.riskLevel}`,
      `Spawn recommendation: ${task.spawnRecommendation}`,
      `Main-agent summary: ${task.summaryForMainAgent}`,
      "",
      "Matched files:"
    );
    if ((task.triggerReasons ?? []).length > 0) {
      lines.push("", "Trigger reasons:");
      for (const reason of task.triggerReasons) {
        lines.push(`- ${reason}`);
      }
    }
    for (const file of task.matchedFiles) {
      lines.push(`- ${file.path} (${file.statusText})`);
    }
    if (task.preflightSignals.length > 0) {
      lines.push("", "Preflight signals:");
      for (const signal of task.preflightSignals) {
        lines.push(
          `- ${signal.severity}: ${formatSignalLocation(signal)} - ${signal.message}`
        );
      }
    }
    lines.push("", "Reference files:");
    for (const reference of task.referenceFiles) {
      lines.push(`- ${reference}`);
    }
    lines.push("", "Prompt:", "", "```text", task.prompt, "```", "");
  }

  return lines.join("\n");
}

function renderSummary(packageJson) {
  const lines = [
    "# Tutti Architecture Review Summary",
    "",
    packageJson.workflowEntry?.packagePath
      ? `Task package: ${packageJson.workflowEntry.packagePath}`
      : null,
    packageJson.workflowEntry?.fromPackage
      ? `Loaded from package: ${packageJson.workflowEntry.fromPackage}`
      : null,
    packageJson.workflowEntry?.scopeFile
      ? `Scope file: ${packageJson.workflowEntry.scopeFile}`
      : null,
    packageJson.workflowEntry?.scopeQuery
      ? `Scope query: ${packageJson.workflowEntry.scopeQuery}`
      : null,
    packageJson.workflowEntry?.scopeMode
      ? `Scope mode: ${packageJson.workflowEntry.scopeMode}`
      : null,
    packageJson.workflowEntry?.scopeSelectionMode
      ? `Scope selection: ${packageJson.workflowEntry.scopeSelectionMode}`
      : null,
    packageJson.workflowEntry?.scopeSummary
      ? `Scope summary: ${packageJson.workflowEntry.scopeSummary}`
      : null,
    packageJson.workflowEntry?.taskFilter
      ? `Task filter: ${packageJson.workflowEntry.taskFilter}`
      : null,
    `Changed files: ${packageJson.changedFiles.length}`,
    `Preflight signals: ${(packageJson.preflightSignals ?? []).length}`,
    (packageJson.crossCuttingReasons ?? []).length > 0
      ? `Cross-cutting reasons: ${packageJson.crossCuttingReasons.join("; ")}`
      : null,
    "",
    "| Task | Risk | Spawn | Files | Signals | Summary |",
    "| --- | --- | --- | ---: | ---: | --- |"
  ].filter(Boolean);

  for (const task of packageJson.tasks) {
    lines.push(
      `| ${task.id} | ${task.riskLevel} | ${task.spawnRecommendation} | ${task.matchedFiles.length} | ${(task.preflightSignals ?? []).length} | ${escapeMarkdownTableCell(task.summaryForMainAgent)} |`
    );
  }

  if (packageJson.tasks.length === 0) {
    lines.push("| _(none)_ | - | - | 0 | 0 | No matching tasks. |");
  }

  return `${lines.join("\n")}\n`;
}

function escapeMarkdownTableCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function taskMatchesFile(taskDefinition, file, context) {
  if (
    taskDefinition.requiresCrossCuttingTrigger &&
    !context.hasCrossCuttingTrigger
  ) {
    return false;
  }
  return matchesPathRules(file, taskDefinition.pathRules ?? []);
}

function matchesPathRules(file, pathRules) {
  return pathRules.some((rule) => matchesPathRule(file, rule));
}

function matchesPathRule(file, rule) {
  if (rule.type === "exact") return file.path === rule.value;
  if (rule.type === "prefix") return file.path.startsWith(rule.value);
  if (rule.type === "contains") return file.path.includes(rule.value);
  if (rule.type === "suffix") return file.path.endsWith(rule.value);
  if (rule.type === "regex") return new RegExp(rule.value).test(file.path);
  if (rule.type === "newTopLevelArea") return isNewTopLevelArea(file);
  if (rule.type === "packageManifest") return isPackageManifest(file.path);
  throw new Error(`Unknown path rule type: ${rule.type}`);
}

function isProductPath(path) {
  return (
    path.startsWith("apps/") ||
    path.startsWith("services/") ||
    path.startsWith("packages/") ||
    path.startsWith("config/")
  );
}

function collectPreflightSignals(changedFiles, options) {
  const signals = [];
  const changedPaths = new Set(changedFiles.map((file) => file.path));
  const hasOpenApi = changedPaths.has(
    "services/tuttid/api/openapi/tuttid.v1.yaml"
  );
  const hasGeneratedDaemon = changedFiles.some((file) =>
    file.path.startsWith("services/tuttid/api/generated/")
  );
  const hasGeneratedClient = changedFiles.some((file) =>
    file.path.startsWith("packages/clients/tuttid-ts/src/generated/")
  );

  if ((hasGeneratedDaemon || hasGeneratedClient) && !hasOpenApi) {
    signals.push({
      id: "generated-without-source",
      severity: "high",
      path: null,
      line: null,
      taskIds: [
        "contracts-and-generated-sources",
        "cross-cutting-architecture"
      ],
      message:
        "Generated API artifacts changed without the OpenAPI source file in the same diff.",
      evidence:
        "services/tuttid/api/generated or packages/clients/tuttid-ts/src/generated changed while services/tuttid/api/openapi/tuttid.v1.yaml did not."
    });
  }

  for (const file of changedFiles) {
    const changedLines = readChangedLines(file, options);
    if (changedLines.length === 0) continue;
    signals.push(...scanFileForPreflightSignals(file, changedLines));
  }

  return signals.sort((left, right) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return (
      severityOrder[left.severity] - severityOrder[right.severity] ||
      String(left.path).localeCompare(String(right.path)) ||
      left.id.localeCompare(right.id)
    );
  });
}

function scanFileForPreflightSignals(file, changedLines) {
  const signals = [];

  for (const changedLine of changedLines) {
    const line = changedLine.text;
    const lineNumber = changedLine.line;

    for (const rule of SIGNAL_RULES) {
      if (!signalMatchesFile(rule, file)) continue;
      if (!signalMatchesLine(rule, file, line)) continue;

      signals.push({
        id: rule.id,
        severity: rule.severity,
        path: file.path,
        line: lineNumber,
        taskIds: rule.taskIds,
        message: rule.message,
        evidence: line.trim()
      });
    }
  }

  return dedupeSignals(signals);
}

function signalMatchesFile(rule, file) {
  if (
    rule.pathRules &&
    rule.pathRules.length > 0 &&
    !matchesPathRules(file, rule.pathRules)
  ) {
    return false;
  }
  if (
    rule.excludePathContains?.some((fragment) => file.path.includes(fragment))
  ) {
    return false;
  }
  if (
    rule.fileExtensions &&
    !rule.fileExtensions.some((extension) => file.path.endsWith(extension))
  ) {
    return false;
  }
  return true;
}

function signalMatchesLine(rule, file, line) {
  if (rule.kind === "crossAreaImport") {
    return isCrossAreaImport(file.path, line);
  }
  if (!rule.lineRegex) {
    throw new Error(`Signal rule ${rule.id} must define lineRegex or kind`);
  }
  return new RegExp(rule.lineRegex).test(line);
}

function readChangedLines(file, options) {
  if (file.status === "D") return [];
  if (file.statusText === "untracked" || file.statusText === "scoped") {
    return readTextFileLines(file.path);
  }

  const diffArgs = options.staged
    ? ["diff", "--cached", "--unified=0", "--", file.path]
    : ["diff", options.base, "--unified=0", "--", file.path];
  return parseAddedDiffLines(git(diffArgs));
}

function readTextFileLines(path) {
  if (!isLikelyTextPath(path)) return [];
  try {
    const buffer = readFileSync(path);
    if (buffer.includes(0)) return [];
    return buffer
      .toString("utf8")
      .split("\n")
      .map((text, index) => ({ text, line: index + 1 }));
  } catch {
    return [];
  }
}

function parseAddedDiffLines(diff) {
  const changedLines = [];
  let newLineNumber = null;

  for (const rawLine of diff.split("\n")) {
    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNumber = Number(hunkMatch[1]);
      continue;
    }

    if (newLineNumber === null) continue;
    if (rawLine.startsWith("+++")) continue;

    if (rawLine.startsWith("+")) {
      changedLines.push({ text: rawLine.slice(1), line: newLineNumber });
      newLineNumber += 1;
      continue;
    }

    if (rawLine.startsWith("-")) {
      continue;
    }

    if (rawLine.startsWith(" ")) {
      newLineNumber += 1;
    }
  }

  return changedLines;
}

function isLikelyTextPath(path) {
  return /\.(?:cjs|css|go|html|js|json|jsx|mjs|md|mts|ts|tsx|txt|yaml|yml)$/.test(
    path
  );
}

function isCrossAreaImport(path, line) {
  if (!/^\s*import\b|^\s*export\b|require\(/.test(line)) return false;
  if (path.startsWith("apps/desktop/")) {
    return /["'](?:services\/|packages\/(?!clients\/tuttid-ts|ui\/system))/.test(
      line
    );
  }
  if (path.startsWith("services/tuttid/")) {
    return /["'](?:apps\/|packages\/)/.test(line);
  }
  if (path.startsWith("packages/")) {
    return /["'](?:apps\/|services\/)/.test(line);
  }
  return false;
}

function dedupeSignals(signals) {
  const byKey = new Map();
  for (const signal of signals) {
    byKey.set(
      `${signal.id}:${signal.path}:${signal.line}:${signal.evidence}`,
      signal
    );
  }
  return [...byKey.values()];
}

function formatSignalLocation(signal) {
  if (!signal.path) return "global";
  return `${signal.path}${signal.line ? `:${signal.line}` : ""}`;
}

function calculateRiskLevel(taskDefinition, matchedFiles, preflightSignals) {
  if (preflightSignals.some((signal) => signal.severity === "high")) {
    return "high";
  }
  if (
    preflightSignals.some((signal) => signal.severity === "medium") ||
    taskDefinition.id === "cross-cutting-architecture" ||
    matchedFiles.some((file) => file.statusText === "untracked") ||
    matchedFiles.length >= 12
  ) {
    return "medium";
  }
  return "low";
}

function calculateSpawnRecommendation(
  riskLevel,
  matchedFiles,
  preflightSignals
) {
  if (
    riskLevel === "high" ||
    preflightSignals.some((signal) => signal.severity === "high")
  ) {
    return "required";
  }
  if (
    riskLevel === "medium" ||
    matchedFiles.length >= 3 ||
    preflightSignals.length > 0
  ) {
    return "recommended";
  }
  return "optional";
}

function summarizeTaskForMainAgent(
  taskDefinition,
  matchedFiles,
  preflightSignals,
  riskLevel,
  spawnRecommendation
) {
  const fileSummary =
    matchedFiles.length === 1 ? "1 file" : `${matchedFiles.length} files`;
  const signalSummary =
    preflightSignals.length === 0
      ? "no preflight signals"
      : `${preflightSignals.length} preflight signal${
          preflightSignals.length === 1 ? "" : "s"
        }`;

  return `${taskDefinition.title}: ${fileSummary}, ${riskLevel} risk, ${signalSummary}; spawn is ${spawnRecommendation}.`;
}

function isNewTopLevelArea(file) {
  return file.statusText === "untracked" && !file.path.includes("/");
}

function isPackageManifest(path) {
  return (
    /^packages\/[^/]+\/[^/]+\/package\.json$/.test(path) ||
    /^packages\/[^/]+\/package\.json$/.test(path)
  );
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
