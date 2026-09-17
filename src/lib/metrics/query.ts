import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type MetricEnvironment = "development" | "production" | "staging";
export type MetricLevel = "ad" | "ad_group" | "app" | "campaign" | "source";
export type MetricPlatform = "android" | "ios";

export type MetricQuery = {
  appId: string;
  currency: string;
  environment: MetricEnvironment;
  from: string;
  granularity?: "day" | "total";
  level: MetricLevel;
  platform?: MetricPlatform;
  sourceId?: string;
  to: string;
};

export type MetricRollupRow = {
  ad_group_id: string | null;
  ad_group_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  buyer_rate: number | string | null;
  buyers: number;
  cac_minor: number | string | null;
  calculated_at: string;
  campaign_id: string | null;
  campaign_name: string | null;
  clicks: number;
  cpi_minor: number | string | null;
  currency: string;
  data_through_at: string;
  installs: number;
  metric_date: string | null;
  metric_level: MetricLevel;
  metric_version: string;
  observed_ltv_d30_minor: number | string | null;
  observed_ltv_d7_minor: number | string | null;
  observed_ltv_d90_minor: number | string | null;
  observed_ltv_lifetime_minor: number | string | null;
  platform: MetricPlatform | null;
  purchase_rate: number | string | null;
  purchases: number;
  registered_users: number;
  registration_rate: number | string | null;
  retention_d1: number | string | null;
  retention_d30: number | string | null;
  retention_d7: number | string | null;
  revenue_minor: number | string;
  roas: number | string | null;
  sessions_per_user: number | string | null;
  source_id: string | null;
  source_name: string | null;
  spend_minor: number | string;
  uninstall_inferred_rate: number | string | null;
};

export function metricsCacheTag(appId: string) {
  return `metrics-${appId}`;
}

async function getCachedMetricRows(query: MetricQuery) {
  const cachedQuery = unstable_cache(
    async () => {
      const service = createSupabaseServiceClient();
      const { data, error } = await service.rpc("query_metric_rollups", {
        requested_app_id: query.appId,
        requested_currency: query.currency,
        requested_environment: query.environment,
        requested_from: query.from,
        requested_granularity: query.granularity ?? "total",
        requested_level: query.level,
        requested_platform: query.platform ?? null,
        requested_source_id: query.sourceId ?? null,
        requested_to: query.to,
      });

      if (error) throw new Error("No se han podido consultar los agregados de métricas.");
      return (data ?? []) as MetricRollupRow[];
    },
    ["metric-rollups", JSON.stringify(query)],
    { revalidate: 60, tags: [metricsCacheTag(query.appId)] },
  );
  return cachedQuery();
}

/** Verifies app access with the user's RLS-bound client before entering the service cache. */
export async function getMetricRowsForVerifiedApp(
  query: MetricQuery,
  authenticatedClient: SupabaseClient,
) {
  const { data, error } = await authenticatedClient
    .from("apps")
    .select("id")
    .eq("id", query.appId)
    .maybeSingle();
  if (error || !data) throw new Error("No tienes acceso a las métricas de esta app.");
  return getCachedMetricRows(query);
}
