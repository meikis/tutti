import { PredefinePageviewReporter } from "../../reporters/predefine-pageview/predefinePageviewReporter.ts";
import type { IReporterService } from "../reporterService.interface.ts";

const reportedDayStorageKey = "tutti.analytics.predefine_pageview.reported_day";

export interface PredefinePageviewAnalyticsController {
  dispose(): void;
  reportToday(): void;
}

export interface PredefinePageviewAnalyticsRuntime {
  addVisibilityChangeListener(listener: () => void): () => void;
  clearTimeout(handle: unknown): void;
  getVisibilityState(): DocumentVisibilityState;
  setTimeout(task: () => void, delayMs: number): unknown;
}

export interface PredefinePageviewAnalyticsStorage {
  getReportedDay(): string | null;
  setReportedDay(dayKey: string): void;
}

export function startPredefinePageviewAnalytics(input: {
  reporterNow?: () => number;
  reporterService: Pick<IReporterService, "trackEvents">;
  runtime?: PredefinePageviewAnalyticsRuntime;
  storage?: PredefinePageviewAnalyticsStorage;
}): PredefinePageviewAnalyticsController {
  const runtime = input.runtime ?? createDocumentPredefinePageviewRuntime();
  const storage = input.storage ?? createLocalStoragePredefinePageviewStorage();
  const now = input.reporterNow ?? Date.now;
  let disposed = false;
  let nextDayTimer: unknown = null;

  const reportToday = () => {
    if (disposed || runtime.getVisibilityState() !== "visible") {
      return;
    }
    const dayKey = toLocalDayKey(now());
    if (storage.getReportedDay() === dayKey) {
      return;
    }
    storage.setReportedDay(dayKey);
    void new PredefinePageviewReporter({
      now,
      reporterService: input.reporterService
    }).report();
  };

  const scheduleNextDayReport = () => {
    clearNextDayReport();
    if (disposed) {
      return;
    }
    nextDayTimer = runtime.setTimeout(
      () => {
        nextDayTimer = null;
        reportToday();
        scheduleNextDayReport();
      },
      Math.max(1, nextLocalDayStart(now()) - now())
    );
  };

  const unsubscribeVisibility = runtime.addVisibilityChangeListener(() => {
    if (runtime.getVisibilityState() === "visible") {
      reportToday();
      scheduleNextDayReport();
    }
  });

  reportToday();
  scheduleNextDayReport();

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribeVisibility();
      clearNextDayReport();
    },
    reportToday
  };

  function clearNextDayReport(): void {
    if (nextDayTimer === null) {
      return;
    }
    runtime.clearTimeout(nextDayTimer);
    nextDayTimer = null;
  }
}

function toLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function nextLocalDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
  ).getTime();
}

function createDocumentPredefinePageviewRuntime(): PredefinePageviewAnalyticsRuntime {
  return {
    addVisibilityChangeListener(listener) {
      document.addEventListener("visibilitychange", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
      };
    },
    clearTimeout(handle) {
      globalThis.clearTimeout(
        handle as ReturnType<typeof globalThis.setTimeout>
      );
    },
    getVisibilityState() {
      return document.visibilityState;
    },
    setTimeout(task, delayMs) {
      return globalThis.setTimeout(task, delayMs);
    }
  };
}

function createLocalStoragePredefinePageviewStorage(): PredefinePageviewAnalyticsStorage {
  return {
    getReportedDay() {
      try {
        return globalThis.localStorage.getItem(reportedDayStorageKey);
      } catch {
        return null;
      }
    },
    setReportedDay(dayKey) {
      try {
        globalThis.localStorage.setItem(reportedDayStorageKey, dayKey);
      } catch {
        // Storage is only a dedupe aid; analytics remains best-effort.
      }
    }
  };
}
