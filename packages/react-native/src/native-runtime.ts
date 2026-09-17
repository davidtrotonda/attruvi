import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AppState,
  Linking,
  NativeModules,
  Platform,
  TurboModuleRegistry,
  type TurboModule,
} from "react-native";

import {
  createUuid,
  type AppStateValue,
  type NativeAttruviModule,
  type RuntimeAdapter,
} from "./runtime.js";
import type { AttruviIdentity } from "./types.js";

interface NativeSpec extends TurboModule {
  getOrCreateIdentifiers(): Promise<{ installationId: string; anonymousId: string }>;
  resetAnonymousId(): Promise<{ installationId: string; anonymousId: string }>;
  getInstallReferrer(): Promise<{
    referrer: string;
    clickTimestampSeconds?: number;
    installTimestampSeconds?: number;
  } | null>;
  getInitialLink(): Promise<string | null>;
  getIdentity(): Promise<string | null>;
  setIdentity(identityJson: string): Promise<void>;
  clearIdentity(): Promise<void>;
}

function requireNativeModule(): NativeSpec {
  const nativeModule =
    TurboModuleRegistry.get<NativeSpec>("AttruviNative") ??
    (NativeModules.AttruviNative as NativeSpec | undefined);
  if (!nativeModule) {
    throw new Error(
      "No se pudo cargar AttruviNative. Ejecuta pod install/recompila Android; en Expo crea un development build.",
    );
  }
  return nativeModule;
}

function parseIdentity(value: string | null): AttruviIdentity | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AttruviIdentity>;
    if (typeof parsed.userId !== "string" || typeof parsed.traits !== "object" || !parsed.traits) {
      return null;
    }
    return parsed as AttruviIdentity;
  } catch {
    return null;
  }
}

function nativeAdapter(): NativeAttruviModule {
  const nativeModule = requireNativeModule();
  return {
    getOrCreateIdentifiers: () => nativeModule.getOrCreateIdentifiers(),
    resetAnonymousId: () => nativeModule.resetAnonymousId(),
    getInstallReferrer: () => nativeModule.getInstallReferrer(),
    getInitialLink: () => nativeModule.getInitialLink(),
    async getIdentity() {
      return parseIdentity(await nativeModule.getIdentity());
    },
    setIdentity: (identity) => nativeModule.setIdentity(JSON.stringify(identity)),
    clearIdentity: () => nativeModule.clearIdentity(),
  };
}

function currentState(): AppStateValue {
  const state = AppState.currentState;
  return state === "active" || state === "background" || state === "inactive" ? state : "unknown";
}

function normalizeState(state: string | null | undefined): AppStateValue {
  return state === "active" || state === "background" || state === "inactive" ? state : "unknown";
}

export function createReactNativeRuntime(): RuntimeAdapter {
  const isDevelopment = (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ === true;
  return {
    platform: Platform.OS === "ios" ? "ios" : "android",
    storage: AsyncStorage,
    native: nativeAdapter(),
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now,
    randomUuid: () => globalThis.crypto?.randomUUID?.() ?? createUuid(),
    getInitialUrl: async () => (await Linking.getInitialURL()) ?? null,
    onUrl(listener) {
      return Linking.addEventListener("url", ({ url }) => listener(url));
    },
    getAppState: currentState,
    onAppStateChanged(listener) {
      return AppState.addEventListener("change", (state) => {
        void listener(normalizeState(state));
      });
    },
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle),
    log(level, message, details) {
      if (!isDevelopment) return;
      const logger = level === "warn" ? console.warn : console.debug;
      logger(`[Attruvi] ${message}`, details ?? "");
    },
  };
}
