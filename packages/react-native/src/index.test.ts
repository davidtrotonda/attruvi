import { describe, expect, it } from "vitest";

import { validateConfiguration } from "./index.js";

describe("configuración del SDK", () => {
  it("exige HTTPS en producción", () => {
    expect(
      validateConfiguration({
        appKey: "attruvi_public_demo",
        endpoint: "https://ingest.example.com/",
        environment: "production",
      }).endpoint,
    ).toBe("https://ingest.example.com");

    expect(() =>
      validateConfiguration({
        appKey: "attruvi_public_demo",
        endpoint: "http://localhost:8787",
        environment: "production",
      }),
    ).toThrow(/HTTPS/);
  });
});
