import { describe, expect, it } from "vitest";
import { createHealthPayload, probeHealthDependency } from "./health";

describe("health web", () => {
  it("solo expone metadatos operativos no sensibles", () => {
    expect(
      createHealthPayload(
        "00000000-0000-4000-8000-000000000001",
        new Date("2026-09-17T18:00:00.000Z"),
        {
          SUPABASE_SECRET_KEY: "no-debe-aparecer",
          VERCEL_ENV: "production",
          VERCEL_GIT_COMMIT_SHA: "1234567890abcdef",
        },
      ),
    ).toEqual({
      environment: "production",
      release: "1234567890ab",
      requestId: "00000000-0000-4000-8000-000000000001",
      service: "attruvi-web",
      status: "ok",
      timestamp: "2026-09-17T18:00:00.000Z",
    });
  });

  it("valida una dependencia sin exponer el cuerpo de respuesta", async () => {
    const ticks = [10, 23];
    const result = await probeHealthDependency(
      "https://worker.example.com/base",
      "attruvi-ingest",
      async () => Response.json({ service: "attruvi-ingest", status: "ok", secret: "no-debe-aparecer" }),
      () => ticks.shift() ?? 23,
    );

    expect(result).toEqual({ httpStatus: 200, latencyMs: 13, status: "ok" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("distingue configuración ausente y una dependencia inalcanzable", async () => {
    await expect(probeHealthDependency(undefined, "attruvi-links")).resolves.toEqual({
      httpStatus: null,
      latencyMs: 0,
      status: "misconfigured",
    });

    await expect(
      probeHealthDependency(
        "https://worker.example.com",
        "attruvi-links",
        async () => {
          throw new Error("network");
        },
        () => 5,
      ),
    ).resolves.toEqual({ httpStatus: null, latencyMs: 0, status: "unreachable" });
  });
});
