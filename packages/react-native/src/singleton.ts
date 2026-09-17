import { AttruviSdkClient } from "./client.js";
import type { RuntimeAdapter } from "./runtime.js";
import type {
  AttruviAttribution,
  AttruviConfiguration,
  AttruviPublicApi,
  AttributionListener,
  ConsentState,
  EventProperties,
  FlushResult,
  TrackOptions,
} from "./types.js";

type RuntimeFactory = () => RuntimeAdapter;

let runtimeFactory: RuntimeFactory | null = null;
let client: AttruviSdkClient | null = null;
const pendingListeners = new Set<AttributionListener>();

export function configureDefaultRuntime(factory: RuntimeFactory): void {
  runtimeFactory = factory;
}

function requireClient(): AttruviSdkClient {
  if (!client) throw new Error("Llama a Attruvi.initialize(...) antes de usar el SDK");
  return client;
}

export const Attruvi: AttruviPublicApi = {
  async initialize(configuration: AttruviConfiguration): Promise<void> {
    if (!client) {
      if (!runtimeFactory) {
        throw new Error(
          "No se encontró el runtime nativo de Attruvi. En Expo usa un development build; Expo Go no incluye este módulo.",
        );
      }
      client = new AttruviSdkClient(runtimeFactory());
      for (const listener of pendingListeners) client.onAttributionChanged(listener);
    }
    await client.initialize(configuration);
  },

  track(
    name: string,
    properties?: EventProperties,
    options?: TrackOptions,
  ): Promise<string | null> {
    return requireClient().track(name, properties, options);
  },

  identify(userId: string, traits?: EventProperties): Promise<void> {
    return requireClient().identify(userId, traits);
  },

  resetIdentity(): Promise<void> {
    return requireClient().resetIdentity();
  },

  setConsent(state: ConsentState): Promise<void> {
    return requireClient().setConsent(state);
  },

  getAttribution(): Promise<AttruviAttribution | null> {
    return requireClient().getAttribution();
  },

  flush(): Promise<FlushResult> {
    return requireClient().flush();
  },

  onAttributionChanged(listener: AttributionListener): () => void {
    pendingListeners.add(listener);
    const unsubscribe = client?.onAttributionChanged(listener);
    return () => {
      pendingListeners.delete(listener);
      unsubscribe?.();
    };
  },
};

export function resetSingletonForTests(): void {
  runtimeFactory = null;
  client = null;
  pendingListeners.clear();
}
