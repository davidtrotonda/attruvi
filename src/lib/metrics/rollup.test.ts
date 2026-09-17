import { describe, expect, it } from "vitest";
import { groupDirtyDays } from "./batching";

describe("metric rollup batching", () => {
  it("recalculates one bounded range per app and environment", () => {
    const groups = groupDirtyDays([
      { app_id: "app-a", environment: "production", metric_date: "2026-09-03", organization_id: "org", reasons: ["events:insert"] },
      { app_id: "app-a", environment: "production", metric_date: "2026-09-01", organization_id: "org", reasons: ["ad_costs:update"] },
      { app_id: "app-a", environment: "development", metric_date: "2026-09-02", organization_id: "org", reasons: ["events:insert"] },
    ]);

    expect(groups).toEqual([
      { appId: "app-a", dates: ["2026-09-03", "2026-09-01"], environment: "production", from: "2026-09-01", to: "2026-09-03" },
      { appId: "app-a", dates: ["2026-09-02"], environment: "development", from: "2026-09-02", to: "2026-09-02" },
    ]);
  });
});
