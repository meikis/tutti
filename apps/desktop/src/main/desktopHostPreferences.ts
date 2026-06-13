import type {
  TuttidClient,
  PutDesktopPreferencesRequest
} from "@tutti-os/client-tuttid-ts";
import {
  normalizeDesktopAgentComposerDefaultsByProvider,
  type DesktopAgentComposerDefaultsByProvider,
  defaultDesktopAgentProvider,
  defaultDesktopDockIconStyle,
  defaultDesktopDockPlacement,
  defaultDesktopSleepPreventionMode,
  type DesktopAgentProvider,
  type DesktopDockIconStyle,
  type DesktopDockPlacement,
  type DesktopSleepPreventionMode
} from "../shared/preferences/index.ts";
import {
  defaultDesktopThemeSource,
  type DesktopThemeSource
} from "../shared/theme/index.ts";
import type { DesktopLocale } from "../shared/i18n/index.ts";
import type { DesktopLogger } from "./logging.ts";

export interface DesktopHostPreferencesState {
  getAgentComposerDefaultsByProvider(): DesktopAgentComposerDefaultsByProvider;
  getDefaultAgentProvider(): DesktopAgentProvider;
  getDockIconStyle(): DesktopDockIconStyle;
  getDockPlacement(): DesktopDockPlacement;
  getLocale(): DesktopLocale;
  getSleepPreventionMode(): DesktopSleepPreventionMode;
  getThemeSource(): DesktopThemeSource;
  subscribe(listener: () => void): () => void;
  sync(input: {
    agentComposerDefaultsByProvider?: DesktopAgentComposerDefaultsByProvider;
    defaultAgentProvider?: DesktopAgentProvider;
    dockIconStyle?: DesktopDockIconStyle;
    dockPlacement?: DesktopDockPlacement;
    locale?: DesktopLocale;
    sleepPreventionMode?: DesktopSleepPreventionMode;
    themeSource?: DesktopThemeSource;
  }): void;
}

export interface CreateDesktopHostPreferencesOptions {
  fallbackLocale: DesktopLocale;
  logger: DesktopLogger;
  tuttidClient: Pick<
    TuttidClient,
    "getDesktopPreferences" | "putDesktopPreferences"
  >;
}

export async function createDesktopHostPreferencesState(
  options: CreateDesktopHostPreferencesOptions
): Promise<DesktopHostPreferencesState> {
  const initialPreferences = await resolveInitialDesktopPreferences(options);
  let agentComposerDefaultsByProvider =
    normalizeDesktopAgentComposerDefaultsByProvider(
      initialPreferences.agentComposerDefaultsByProvider
    );
  let defaultAgentProvider = initialPreferences.defaultAgentProvider;
  let dockIconStyle = initialPreferences.dockIconStyle;
  let dockPlacement = initialPreferences.dockPlacement;
  let locale = initialPreferences.locale;
  let sleepPreventionMode = initialPreferences.sleepPreventionMode;
  let themeSource = initialPreferences.themeSource;
  const listeners = new Set<() => void>();

  return {
    getAgentComposerDefaultsByProvider() {
      return agentComposerDefaultsByProvider;
    },
    getDefaultAgentProvider() {
      return defaultAgentProvider;
    },
    getDockIconStyle() {
      return dockIconStyle;
    },
    getDockPlacement() {
      return dockPlacement;
    },
    getLocale() {
      return locale;
    },
    getSleepPreventionMode() {
      return sleepPreventionMode;
    },
    getThemeSource() {
      return themeSource;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync(input) {
      const previousAgentComposerDefaultsByProvider =
        agentComposerDefaultsByProvider;
      const previousDefaultAgentProvider = defaultAgentProvider;
      const previousDockIconStyle = dockIconStyle;
      const previousDockPlacement = dockPlacement;
      const previousLocale = locale;
      const previousSleepPreventionMode = sleepPreventionMode;
      const previousThemeSource = themeSource;
      if (input.agentComposerDefaultsByProvider) {
        agentComposerDefaultsByProvider =
          normalizeDesktopAgentComposerDefaultsByProvider(
            input.agentComposerDefaultsByProvider
          );
      }
      if (input.defaultAgentProvider) {
        defaultAgentProvider = input.defaultAgentProvider;
      }
      if (input.dockIconStyle) {
        dockIconStyle = input.dockIconStyle;
      }
      if (input.dockPlacement) {
        dockPlacement = input.dockPlacement;
      }
      if (input.locale) {
        locale = input.locale;
      }
      if (input.sleepPreventionMode) {
        sleepPreventionMode = input.sleepPreventionMode;
      }
      if (input.themeSource) {
        themeSource = input.themeSource;
      }
      if (
        agentComposerDefaultsByProvider !==
          previousAgentComposerDefaultsByProvider ||
        defaultAgentProvider !== previousDefaultAgentProvider ||
        dockIconStyle !== previousDockIconStyle ||
        dockPlacement !== previousDockPlacement ||
        locale !== previousLocale ||
        sleepPreventionMode !== previousSleepPreventionMode ||
        themeSource !== previousThemeSource
      ) {
        for (const listener of listeners) {
          listener();
        }
      }
    }
  };
}

async function resolveInitialDesktopPreferences(
  options: CreateDesktopHostPreferencesOptions
): Promise<PutDesktopPreferencesRequest["preferences"]> {
  try {
    const response = await options.tuttidClient.getDesktopPreferences();
    if (response.initialized) {
      return response.preferences;
    }

    return (
      await options.tuttidClient.putDesktopPreferences({
        preferences: {
          agentComposerDefaultsByProvider: {},
          defaultAgentProvider: defaultDesktopAgentProvider,
          dockIconStyle: defaultDesktopDockIconStyle,
          dockPlacement: defaultDesktopDockPlacement,
          locale: options.fallbackLocale,
          sleepPreventionMode: defaultDesktopSleepPreventionMode,
          themeSource: defaultDesktopThemeSource
        }
      })
    ).preferences;
  } catch (error) {
    options.logger.warn("failed to resolve desktop preferences from tuttid", {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      agentComposerDefaultsByProvider: {},
      defaultAgentProvider: defaultDesktopAgentProvider,
      dockIconStyle: defaultDesktopDockIconStyle,
      dockPlacement: defaultDesktopDockPlacement,
      locale: options.fallbackLocale,
      sleepPreventionMode: defaultDesktopSleepPreventionMode,
      themeSource: defaultDesktopThemeSource
    };
  }
}
