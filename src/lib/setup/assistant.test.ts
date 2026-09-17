import { describe, expect, it } from "vitest";
import { buildSetupAiPrompt, buildSetupMarkdown, deriveSetupSteps } from "./assistant";

const app = {
  currency: "EUR",
  id: "10000000-0000-4000-8000-000000000001",
  name: "Solsuna",
  organizationName: "Demo",
  slug: "solsuna",
  timezone: "Europe/Madrid",
};
const platforms = [
  { androidPackageName: "com.example.solsuna", iosBundleId: null, platform: "android" as const },
  { androidPackageName: null, iosBundleId: "com.example.solsuna", platform: "ios" as const },
];

describe("setup assistant", () => {
  it("crea un prompt específico sin inventar secretos", () => {
    const prompt = buildSetupAiPrompt({ app, endpoint: "https://ingest.attruvi.com", linkDomain: "links.attruvi.com", platforms });
    expect(prompt).toContain("com.example.solsuna");
    expect(prompt).toContain("@attruvi/react-native");
    expect(prompt).toContain("PEGA_AQUI_LA_APPKEY_PUBLICA");
    expect(prompt).not.toMatch(/service_role|client_secret|private[_ -]?key/i);
  });

  it("genera un ATTRUVI_SETUP descargable con bare y Expo development build", () => {
    const markdown = buildSetupMarkdown({ app, endpoint: "https://ingest.attruvi.com", linkDomain: "links.attruvi.com", platforms });
    expect(markdown).toContain("# ATTRUVI_SETUP — Solsuna");
    expect(markdown).toContain("bundle exec pod install");
    expect(markdown).toContain("npx expo prebuild");
    expect(markdown).toContain("No funciona en Expo Go");
  });

  it("marca automáticamente el primer paso incompleto", () => {
    const steps = deriveSetupSteps({
      associationReady: false,
      connectedNetworks: 0,
      debugStages: new Set(),
      eventNames: new Set(),
      hasActiveDevelopmentKey: true,
      hasActiveSmartLink: false,
      hasRealSdkInstallation: false,
      platforms,
    });
    expect(steps.map((step) => step.state)).toEqual(["complete", "complete", "current", "pending", "pending", "pending", "pending", "pending"]);
  });
});
