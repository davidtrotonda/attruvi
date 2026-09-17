import { describe, expect, it } from "vitest";
import { validateServerEnvironment } from "./validation";

describe("validación segura del entorno", () => {
  it("permite compilar la landing sin credenciales", () => {
    expect(validateServerEnvironment({})).toEqual({ mode: "landing", warnings: [] });
  });

  it("rechaza secretos publicados en variables NEXT_PUBLIC", () => {
    expect(() => validateServerEnvironment({ NEXT_PUBLIC_API_SECRET: "sensitive-placeholder" })).toThrow(
      "no puede exponerse",
    );
  });

  it("rechaza configuraciones parciales", () => {
    expect(() => validateServerEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://project.example.com" })).toThrow(
      "deben configurarse juntas",
    );
  });

  it("acepta un llavero versionado y seguro", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(
      validateServerEnvironment({
        CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION: "2026-09",
        CONNECTOR_ENCRYPTION_KEYS: JSON.stringify({ "2026-09": key }),
      }),
    ).toMatchObject({ mode: "landing" });
  });
});
