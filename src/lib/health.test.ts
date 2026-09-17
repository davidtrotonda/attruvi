import { describe, expect, it } from "vitest";
import { createHealthPayload } from "./health";

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
});
