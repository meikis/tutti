import { createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  truncate
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type {
  ClearDeveloperLogsResult,
  DesktopDeveloperLogFileSummary,
  DesktopDeveloperLogKind,
  DesktopDeveloperLogsState,
  ExportDeveloperLogsResult
} from "../shared/contracts/ipc";
import type { DesktopResolvedDefaults } from "./defaults";
import {
  buildProviderAgentSessionRecordFiles,
  type DeveloperLogsAgentSessionRecord,
  type ExportedAgentSessionFile
} from "./developerLogsAgentSessions.ts";
import yazl from "yazl";

export interface DeveloperLogsDependencies {
  appCenterSnapshotProvider?: () => Promise<DeveloperLogsAppCenterSnapshot | null>;
  agentSessionsProvider?: () => Promise<DeveloperLogsAgentSessionRecord[]>;
  defaults: Pick<DesktopResolvedDefaults, "state">;
  desktopVersion: string;
  flushLogs?: () => Promise<void> | void;
  getDownloadsPath?: () => string;
  persistedLocale?: string | null;
  preferredSystemLanguages?: readonly string[] | null;
  systemLocale?: string | null;
  transportSnapshot?: unknown;
}

export interface DeveloperLogsAppCenterSnapshot {
  workspaces: Array<{
    appFactoryJobsResponse: unknown;
    appsResponse: unknown;
    workspaceId: string;
  }>;
}

const managedDesktopLogPrefixes = ["tutti-desktop"];
const managedDaemonLogPrefixes = ["tuttid"];

export function createDeveloperLogsService(
  deps: DeveloperLogsDependencies
): DeveloperLogsService {
  return new DeveloperLogsService(deps);
}

export class DeveloperLogsService {
  private readonly deps: DeveloperLogsDependencies;

  constructor(deps: DeveloperLogsDependencies) {
    this.deps = deps;
  }

  async getLogsState(): Promise<DesktopDeveloperLogsState> {
    await this.deps.flushLogs?.();
    const files = await Promise.all([
      summarizeLogFile("daemon", this.deps.defaults.state.tuttidLogPath),
      summarizeLogFile("desktop", this.deps.defaults.state.desktopLogPath)
    ]);
    const managed = await listManagedLogFiles(this.deps.defaults.state.logsDir);

    return {
      desktopVersion: this.deps.desktopVersion,
      files,
      logsDir: this.deps.defaults.state.logsDir,
      totalFiles: managed.length,
      totalSizeBytes: managed.reduce((sum, file) => sum + file.sizeBytes, 0)
    };
  }

  async clearLogs(): Promise<ClearDeveloperLogsResult> {
    const managedFiles = await listManagedLogFiles(
      this.deps.defaults.state.logsDir
    );
    let clearedFiles = 0;
    let clearedSizeBytes = 0;
    const clearedPaths: string[] = [];
    const activePaths = new Set([
      this.deps.defaults.state.tuttidLogPath,
      this.deps.defaults.state.desktopLogPath
    ]);

    for (const file of managedFiles) {
      if (activePaths.has(file.path)) {
        await truncate(file.path, 0);
      } else {
        await rm(file.path, { force: true });
      }
      clearedFiles += 1;
      clearedSizeBytes += file.sizeBytes;
      clearedPaths.push(file.path);
    }

    return {
      clearedFiles,
      clearedPaths,
      clearedSizeBytes
    };
  }

  async exportLogs(savePath?: string): Promise<ExportDeveloperLogsResult> {
    await this.deps.flushLogs?.();
    const managedFiles = await listManagedLogFiles(
      this.deps.defaults.state.logsDir
    );
    const appLogFiles = await listWorkspaceAppLogFiles(
      this.deps.defaults.state.rootDir
    );
    const appFactoryLogFiles = await listAppFactoryLogFiles(
      this.deps.defaults.state.rootDir
    );
    const agentSessions = await this.deps
      .agentSessionsProvider?.()
      .catch(() => []);
    const agentSessionFiles = buildProviderAgentSessionRecordFiles(
      agentSessions ?? []
    );
    const appCenterSnapshot = await this.deps
      .appCenterSnapshotProvider?.()
      .catch(() => null);
    const logFiles = [
      ...managedFiles.map((file) => ({
        ...file,
        archivePath: joinZipPath("logs", basename(file.path))
      })),
      ...appLogFiles,
      ...appFactoryLogFiles
    ];
    if (
      logFiles.length + agentSessionFiles.length === 0 &&
      !appCenterSnapshot
    ) {
      return {
        canceled: false,
        fileCount: 0,
        filePath: await this.writeEmptyExport(savePath)
      };
    }

    const targetPath = savePath
      ? ensureZipFilePath(savePath)
      : ensureZipFilePath(
          join(
            this.deps.getDownloadsPath?.() ?? this.deps.defaults.state.logsDir,
            createDefaultDeveloperLogsExportFileName()
          )
        );

    await mkdir(dirname(targetPath), { recursive: true });

    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(targetPath);
    const completed = new Promise<void>((resolveCompleted, rejectCompleted) => {
      output.on("close", resolveCompleted);
      output.on("error", rejectCompleted);
      zipFile.outputStream.on("error", rejectCompleted);
    });

    zipFile.outputStream.pipe(output);

    for (const file of logFiles) {
      const content = await readFile(file.path);
      zipFile.addBuffer(content, file.archivePath);
    }
    for (const file of agentSessionFiles) {
      zipFile.addBuffer(file.content, file.archivePath);
    }
    if (appCenterSnapshot) {
      zipFile.addBuffer(
        Buffer.from(JSON.stringify(appCenterSnapshot, null, 2), "utf8"),
        "app-center-snapshot.json"
      );
    }

    const runtimeContext = buildRuntimeContext({
      defaults: this.deps.defaults,
      desktopVersion: this.deps.desktopVersion,
      agentSessionFiles,
      logFiles,
      persistedLocale: this.deps.persistedLocale ?? null,
      preferredSystemLanguages: this.deps.preferredSystemLanguages ?? null,
      systemLocale: this.deps.systemLocale ?? null,
      transportSnapshot: this.deps.transportSnapshot ?? null
    });

    zipFile.addBuffer(
      Buffer.from(JSON.stringify(runtimeContext, null, 2), "utf8"),
      "runtime-context.json"
    );
    zipFile.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            desktopVersion: this.deps.desktopVersion,
            exportedAt: new Date().toISOString(),
            logsDir: this.deps.defaults.state.logsDir,
            agentSessionFileCount: agentSessionFiles.length,
            appCenterSnapshotIncluded: appCenterSnapshot !== null,
            appFactoryLogFileCount: appFactoryLogFiles.length,
            appLogFileCount: appLogFiles.length,
            fileCount: logFiles.length + agentSessionFiles.length,
            managedLogFileCount: managedFiles.length,
            totalSizeBytes:
              logFiles.reduce((sum, file) => sum + file.sizeBytes, 0) +
              agentSessionFiles.reduce((sum, file) => sum + file.sizeBytes, 0)
          },
          null,
          2
        ),
        "utf8"
      ),
      "export-summary.json"
    );

    zipFile.end();
    await completed;

    return {
      canceled: false,
      fileCount: logFiles.length + agentSessionFiles.length,
      filePath: targetPath
    };
  }

  private async writeEmptyExport(savePath?: string): Promise<string> {
    const targetPath = ensureZipFilePath(
      savePath ??
        join(
          this.deps.getDownloadsPath?.() ?? this.deps.defaults.state.logsDir,
          createDefaultDeveloperLogsExportFileName()
        )
    );
    await mkdir(dirname(targetPath), { recursive: true });
    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(targetPath);
    const completed = new Promise<void>((resolveCompleted, rejectCompleted) => {
      output.on("close", resolveCompleted);
      output.on("error", rejectCompleted);
      zipFile.outputStream.on("error", rejectCompleted);
    });
    zipFile.outputStream.pipe(output);
    const runtimeContext = buildRuntimeContext({
      defaults: this.deps.defaults,
      desktopVersion: this.deps.desktopVersion,
      agentSessionFiles: [],
      logFiles: [],
      persistedLocale: this.deps.persistedLocale ?? null,
      preferredSystemLanguages: this.deps.preferredSystemLanguages ?? null,
      systemLocale: this.deps.systemLocale ?? null,
      transportSnapshot: this.deps.transportSnapshot ?? null
    });
    zipFile.addBuffer(
      Buffer.from(JSON.stringify(runtimeContext, null, 2), "utf8"),
      "runtime-context.json"
    );
    zipFile.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            desktopVersion: this.deps.desktopVersion,
            exportedAt: new Date().toISOString(),
            logsDir: this.deps.defaults.state.logsDir,
            agentSessionFileCount: 0,
            fileCount: 0,
            totalSizeBytes: 0
          },
          null,
          2
        ),
        "utf8"
      ),
      "export-summary.json"
    );
    zipFile.end();
    await completed;
    return targetPath;
  }
}

interface ManagedLogFile {
  path: string;
  sizeBytes: number;
}

interface ExportedLogFile extends ManagedLogFile {
  archivePath: string;
}

export function createDefaultDeveloperLogsExportFileName(
  now = new Date()
): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `tutti-logs-${stamp}.zip`;
}

interface BuildRuntimeContextInput {
  defaults: Pick<DesktopResolvedDefaults, "state">;
  desktopVersion: string;
  agentSessionFiles: ExportedAgentSessionFile[];
  logFiles: ExportedLogFile[];
  persistedLocale: string | null;
  preferredSystemLanguages: readonly string[] | null;
  systemLocale: string | null;
  transportSnapshot: unknown;
}

function buildRuntimeContext(input: BuildRuntimeContextInput): {
  defaults: Pick<DesktopResolvedDefaults, "state">;
  locale: {
    preferredSystemLanguages: readonly string[];
    persisted: string | null;
    system: string | null;
  };
  logFiles: Array<{
    archivePath: string;
    name: string;
    path: string;
    sizeBytes: number;
  }>;
  agentSessionFiles: Array<{
    agentSessionID: string;
    archivePath: string;
    name: string;
    path: string;
    provider: string;
    sizeBytes: number;
    workspaceID: string;
  }>;
  overrides: Record<string, string>;
  runtime: {
    desktopVersion: string;
    electron: string | undefined;
    tuttiEnv: string | undefined;
    node: string | undefined;
    platform: NodeJS.Platform;
    release: string;
    sessionId: string | undefined;
  };
  transport: unknown;
} {
  return {
    defaults: input.defaults,
    locale: {
      preferredSystemLanguages: input.preferredSystemLanguages ?? [],
      persisted: input.persistedLocale,
      system: input.systemLocale
    },
    logFiles: input.logFiles.map((file) => ({
      archivePath: file.archivePath,
      name: basename(file.path),
      path: file.path,
      sizeBytes: file.sizeBytes
    })),
    agentSessionFiles: input.agentSessionFiles.map((file) => ({
      agentSessionID: file.agentSessionID,
      archivePath: file.archivePath,
      name: basename(file.archivePath),
      path: file.path,
      provider: file.provider,
      sizeBytes: file.sizeBytes,
      workspaceID: file.workspaceID
    })),
    overrides: collectRuntimeOverrides(),
    runtime: {
      desktopVersion: input.desktopVersion,
      electron: process.versions.electron,
      tuttiEnv: process.env.TUTTI_ENV,
      node: process.versions.node,
      platform: process.platform,
      release: process.release.name,
      sessionId: process.env.TUTTI_SESSION_ID
    },
    transport: input.transportSnapshot
  };
}

function collectRuntimeOverrides(): Record<string, string> {
  const supported = [
    "TUTTI_ENV",
    "TUTTI_STATE_DIR",
    "TUTTI_LOG_DIR",
    "TUTTI_LOG_MAX_SIZE_MB",
    "TUTTI_LOG_MAX_BACKUPS",
    "TUTTI_LOG_MAX_AGE_DAYS",
    "TUTTI_LOG_MAX_TOTAL_MB",
    "TUTTID_TRANSPORT",
    "TUTTID_ADDR",
    "TUTTID_SOCKET_PATH",
    "TUTTID_PIPE_PATH",
    "TUTTID_RUN_DIR",
    "TUTTID_DB_PATH",
    "TUTTID_PID_PATH",
    "TUTTID_LOG_PATH",
    "TUTTID_LOG_OUTPUT",
    "TUTTID_LOG_LEVEL",
    "TUTTID_FORWARD_STDIO",
    "TUTTI_DESKTOP_LOG_PATH",
    "TUTTI_DESKTOP_LOG_OUTPUT",
    "TUTTI_DESKTOP_LOG_LEVEL",
    "TUTTI_SESSION_ID"
  ] as const;

  const entries = supported.flatMap((key) => {
    const value = process.env[key];
    return value ? [[key, value] as const] : [];
  });

  return Object.fromEntries(entries);
}

async function summarizeLogFile(
  kind: DesktopDeveloperLogKind,
  path: string
): Promise<DesktopDeveloperLogFileSummary> {
  try {
    const info = await stat(path);
    return {
      exists: true,
      kind,
      path,
      sizeBytes: info.size
    };
  } catch {
    return {
      exists: false,
      kind,
      path,
      sizeBytes: 0
    };
  }
}

async function listManagedLogFiles(logsDir: string): Promise<ManagedLogFile[]> {
  let names: string[];
  try {
    names = await readdir(logsDir);
  } catch {
    return [];
  }

  const files = await Promise.all(
    names.filter(isManagedTuttiLogFileName).map(async (name) => {
      const path = join(logsDir, name);
      try {
        const info = await stat(path);
        if (!info.isFile()) {
          return null;
        }

        return {
          path,
          sizeBytes: info.size
        } satisfies ManagedLogFile;
      } catch {
        return null;
      }
    })
  );

  return files.filter((file): file is ManagedLogFile => file !== null);
}

async function listWorkspaceAppLogFiles(
  stateRootDir: string
): Promise<ExportedLogFile[]> {
  const appWorkspacesDir = join(stateRootDir, "apps", "workspaces");
  let workspaceEntries: Dirent[];
  try {
    workspaceEntries = await readdir(appWorkspacesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const workspaceFiles = await Promise.all(
    workspaceEntries
      .filter((entry) => entry.isDirectory())
      .map(async (workspaceEntry) => {
        const workspaceID = workspaceEntry.name;
        const workspaceDir = join(appWorkspacesDir, workspaceID);
        let appEntries: Dirent[];
        try {
          appEntries = await readdir(workspaceDir, { withFileTypes: true });
        } catch {
          return [];
        }

        const appFiles = await Promise.all(
          appEntries
            .filter((entry) => entry.isDirectory())
            .map((appEntry) =>
              listWorkspaceAppLogDirFiles({
                appID: appEntry.name,
                logsDir: join(workspaceDir, appEntry.name, "logs"),
                workspaceID
              })
            )
        );
        return appFiles.flat();
      })
  );

  return workspaceFiles.flat();
}

async function listWorkspaceAppLogDirFiles(input: {
  appID: string;
  logsDir: string;
  workspaceID: string;
}): Promise<ExportedLogFile[]> {
  const files: ExportedLogFile[] = [];
  const pending = [input.logsDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const info = await lstat(path);
        if (!info.isFile()) {
          continue;
        }
        files.push({
          archivePath: joinZipPath(
            "app-logs",
            safeZipPathSegment(input.workspaceID),
            safeZipPathSegment(input.appID),
            ...relative(input.logsDir, path)
              .split(/[\\/]+/)
              .map(safeZipPathSegment)
          ),
          path,
          sizeBytes: info.size
        });
      } catch {
        continue;
      }
    }
  }

  return files;
}

async function listAppFactoryLogFiles(
  stateRootDir: string
): Promise<ExportedLogFile[]> {
  const factoryJobsDir = join(stateRootDir, "apps", "factory", "jobs");
  let jobEntries: Dirent[];
  try {
    jobEntries = await readdir(factoryJobsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jobFiles = await Promise.all(
    jobEntries
      .filter((entry) => entry.isDirectory())
      .map((jobEntry) =>
        listAppFactoryJobLogDirFiles({
          jobID: jobEntry.name,
          logsDir: join(factoryJobsDir, jobEntry.name, "logs")
        })
      )
  );

  return jobFiles.flat();
}

async function listAppFactoryJobLogDirFiles(input: {
  jobID: string;
  logsDir: string;
}): Promise<ExportedLogFile[]> {
  const files: ExportedLogFile[] = [];
  const pending = [input.logsDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const info = await lstat(path);
        if (!info.isFile()) {
          continue;
        }
        files.push({
          archivePath: joinZipPath(
            "app-factory-logs",
            safeZipPathSegment(input.jobID),
            ...relative(input.logsDir, path)
              .split(/[\\/]+/)
              .map(safeZipPathSegment)
          ),
          path,
          sizeBytes: info.size
        });
      } catch {
        continue;
      }
    }
  }

  return files;
}

function ensureZipFilePath(filePath: string): string {
  return filePath.toLowerCase().endsWith(".zip") ? filePath : `${filePath}.zip`;
}

function joinZipPath(...parts: string[]): string {
  return parts
    .map((part) => part.replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function isManagedTuttiLogFileName(name: string): boolean {
  const match = /^(.*)\.log$/i.exec(name);
  if (!match) {
    return false;
  }

  const base = (match[1] ?? "").toLowerCase();
  return (
    matchesManagedPrefix(base, managedDesktopLogPrefixes) ||
    matchesManagedPrefix(base, managedDaemonLogPrefixes)
  );
}

function matchesManagedPrefix(base: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => {
    if (base === prefix) {
      return true;
    }

    if (!base.startsWith(`${prefix}.`)) {
      return false;
    }

    const suffix = base.slice(prefix.length + 1);
    return /^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/.test(suffix);
  });
}

function safeZipPathSegment(value: string): string {
  const safe = value.trim().replaceAll(/[^\p{L}\p{N}_.-]/gu, "_");
  if (safe === "" || safe === "." || safe === "..") {
    return "_";
  }
  return safe;
}
