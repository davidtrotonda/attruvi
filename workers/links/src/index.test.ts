import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("links worker", () => {
  it("expone salud y falla cerrado ante un slug desconocido", async () => {
    const health = await exports.default.fetch("https://links.example.com/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });

    const missing = await exports.default.fetch("https://links.example.com/desconocido");
    expect(missing.status).toBe(404);
  });
});
