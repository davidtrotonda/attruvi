import "server-only";

import { revalidateTag } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { metricsCacheTag } from "./query";
import { groupDirtyDays, type DirtyMetricDay } from "./batching";

export async function runMetricRollupBatch(batchSize = 100) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("claim_metric_dirty_days", {
    requested_limit: Math.max(1, Math.min(500, batchSize)),
  });
  if (error) throw new Error("No se han podido reclamar las cohortes pendientes.");

  const dirtyDays = (data ?? []) as DirtyMetricDay[];
  const groups = groupDirtyDays(dirtyDays);
  const results = await Promise.all(groups.map(async (group) => {
    const dataThroughAt = new Date().toISOString();
    const { error: recalculateError } = await service.rpc("recalculate_daily_metrics", {
      requested_app_id: group.appId,
      requested_data_through_at: dataThroughAt,
      requested_environment: group.environment,
      requested_from: group.from,
      requested_metric_version: "metrics-v1",
      requested_to: group.to,
    });

    if (recalculateError) {
      await Promise.all(group.dates.map((metricDate) => service.rpc("release_metric_dirty_day", {
        requested_app_id: group.appId,
        requested_environment: group.environment,
        requested_error: recalculateError.code ?? "metric_recalculation_failed",
        requested_metric_date: metricDate,
      })));
      return { appId: group.appId, error: true };
    }

    const { data: reconciliation, error: reconciliationError } = await service.rpc(
      "reconcile_daily_metrics",
      {
        requested_app_id: group.appId,
        requested_data_through_at: dataThroughAt,
        requested_environment: group.environment,
        requested_from: group.from,
        requested_metric_version: "metrics-v1",
        requested_to: group.to,
      },
    );
    revalidateTag(metricsCacheTag(group.appId), { expire: 0 });
    const reconciliationResult = reconciliation as { matches?: boolean } | null;
    return {
      appId: group.appId,
      error: Boolean(reconciliationError) || reconciliationResult?.matches !== true,
    };
  }));

  return {
    claimedDays: dirtyDays.length,
    failedGroups: results.filter((result) => result.error).length,
    groups: groups.length,
    succeededGroups: results.filter((result) => !result.error).length,
  };
}
