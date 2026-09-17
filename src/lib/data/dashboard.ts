import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@/lib/auth/session";
import type { DashboardEnvironment, DashboardLevel, DashboardPlatform } from "@/lib/dashboard/filters";
import { previousPeriod } from "@/lib/dashboard/filters";
import { getDashboardContext } from "@/lib/data/dashboard-context";
import {
  getMetricRowsForVerifiedApp,
  type MetricLevel,
  type MetricRollupRow,
} from "@/lib/metrics/query";

type SharedFilters = {
  app?: string;
  environment: DashboardEnvironment;
  from: string;
  platform?: DashboardPlatform;
  source?: string;
  to: string;
  workspace?: string;
};

type DataHealth = {
  connectedProviders: number;
  pendingCredentials: boolean;
  status: "complete" | "partial" | "syncing" | "without_costs";
  unmatchedCosts: number;
};

function numeric(value: number | string | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

function emptyMetric(): MetricRollupRow {
  return {
    ad_group_id: null, ad_group_name: null, ad_id: null, ad_name: null,
    buyer_rate: null, buyers: 0, cac_minor: null, calculated_at: "",
    campaign_id: null, campaign_name: null, clicks: 0, cpi_minor: null,
    currency: "EUR", data_through_at: "", installs: 0, metric_date: null,
    metric_level: "app", metric_version: "metrics-v1", observed_ltv_d30_minor: null,
    observed_ltv_d7_minor: null, observed_ltv_d90_minor: null,
    observed_ltv_lifetime_minor: null, platform: null, purchase_rate: null,
    purchases: 0, registered_users: 0, registration_rate: null,
    retention_d1: null, retention_d30: null, retention_d7: null,
    revenue_minor: 0, roas: null, sessions_per_user: null, source_id: null,
    source_name: null, spend_minor: 0, uninstall_inferred_rate: null,
  };
}

async function readDataHealth(
  client: SupabaseClient,
  appId: string,
  totals: MetricRollupRow,
): Promise<DataHealth> {
  const [connectorsResult, runsResult, unmatchedResult] = await Promise.all([
    client
      .from("connector_accounts")
      .select("connection_state")
      .eq("app_id", appId),
    client
      .from("connector_sync_runs")
      .select("id", { count: "exact", head: true })
      .eq("app_id", appId)
      .in("status", ["pending", "running"]),
    client
      .from("ad_costs")
      .select("id", { count: "exact", head: true })
      .eq("app_id", appId)
      .in("match_status", ["unmatched", "partially_matched"]),
  ]);
  if (connectorsResult.error || runsResult.error || unmatchedResult.error) {
    throw new Error("No se ha podido comprobar el estado de los datos.");
  }
  const connectors = connectorsResult.data ?? [];
  const syncing = (runsResult.count ?? 0) > 0;
  const unmatchedCosts = unmatchedResult.count ?? 0;
  const pendingCredentials = connectors.length === 0 || connectors.some((connector) =>
    connector.connection_state === "pending_credentials" ||
    connector.connection_state === "reconnect_required",
  );
  const withoutCosts = numeric(totals.installs) > 0 && numeric(totals.spend_minor) === 0;
  return {
    connectedProviders: connectors.filter((connector) => connector.connection_state === "ready").length,
    pendingCredentials,
    status: syncing ? "syncing" : withoutCosts ? "without_costs" : unmatchedCosts > 0 ? "partial" : "complete",
    unmatchedCosts,
  };
}

function queryFor(
  appId: string,
  currency: string,
  filters: SharedFilters,
  level: MetricLevel,
  granularity: "day" | "total" = "total",
) {
  return {
    appId,
    currency,
    environment: filters.environment,
    from: filters.from,
    granularity,
    level,
    ...(filters.platform ? { platform: filters.platform } : {}),
    to: filters.to,
  } as const;
}

export async function getDashboardOverview(identity: VerifiedIdentity, filters: SharedFilters) {
  const context = await getDashboardContext(identity, filters);
  const app = context.selectedApp;
  if (!app) return { ...context, current: emptyMetric(), health: null, previous: emptyMetric(), topAds: [], trend: [] };
  const previous = previousPeriod(filters.from, filters.to);
  const currentQuery = queryFor(app.id, app.currency, filters, "app");
  const previousQuery = queryFor(app.id, app.currency, { ...filters, ...previous }, "app");

  const [currentRows, previousRows, trend, topAds] = await Promise.all([
    getMetricRowsForVerifiedApp(currentQuery, context.client),
    getMetricRowsForVerifiedApp(previousQuery, context.client),
    getMetricRowsForVerifiedApp({ ...currentQuery, granularity: "day" }, context.client),
    getMetricRowsForVerifiedApp(queryFor(app.id, app.currency, filters, "ad"), context.client),
  ]);
  const current = currentRows[0] ?? emptyMetric();
  const health = await readDataHealth(context.client, app.id, current);
  return {
    ...context,
    current,
    health,
    previous: previousRows[0] ?? emptyMetric(),
    topAds: topAds
      .toSorted((left, right) =>
        numeric(right.revenue_minor) - numeric(left.revenue_minor) ||
        numeric(right.roas) - numeric(left.roas),
      )
      .slice(0, 8),
    trend,
  };
}

const sortableMetrics = new Set([
  "name", "spend_minor", "installs", "cpi_minor", "buyers", "cac_minor",
  "revenue_minor", "roas", "retention_d7", "observed_ltv_lifetime_minor",
]);

export type CampaignSort =
  | "buyers" | "cac_minor" | "cpi_minor" | "installs" | "name"
  | "observed_ltv_lifetime_minor" | "retention_d7" | "revenue_minor" | "roas" | "spend_minor";

function rowName(row: MetricRollupRow, level: DashboardLevel) {
  return level === "ad" ? row.ad_name : level === "ad_group" ? row.ad_group_name : row.campaign_name;
}

function compareRows(left: MetricRollupRow, right: MetricRollupRow, level: DashboardLevel, sort: string, direction: "asc" | "desc") {
  const factor = direction === "asc" ? 1 : -1;
  if (sort === "name") return (rowName(left, level) ?? "").localeCompare(rowName(right, level) ?? "", "es") * factor;
  const leftValue = numeric(left[sort as keyof MetricRollupRow] as number | string | null);
  const rightValue = numeric(right[sort as keyof MetricRollupRow] as number | string | null);
  return (leftValue - rightValue) * factor || (rowName(left, level) ?? "").localeCompare(rowName(right, level) ?? "", "es");
}

export async function getCampaignDashboard(
  identity: VerifiedIdentity,
  filters: SharedFilters & {
    direction?: string;
    level: DashboardLevel;
    page: number;
    sort?: string;
  },
) {
  const context = await getDashboardContext(identity, filters);
  const app = context.selectedApp;
  if (!app) return {
    ...context,
    direction: filters.direction === "asc" ? "asc" as const : "desc" as const,
    health: null,
    page: filters.page,
    pageCount: 0,
    rows: [],
    sort: sortableMetrics.has(filters.sort ?? "") ? filters.sort! : "revenue_minor",
    sources: [],
    total: 0,
  };
  const { data: sources, error: sourcesError } = await context.client
    .from("sources")
    .select("id,kind,name")
    .eq("app_id", app.id)
    .order("name");
  if (sourcesError) throw new Error("No se han podido cargar las fuentes.");
  const sourceIds = new Set((sources ?? []).filter((source) => !filters.source || source.kind === filters.source).map((source) => source.id));
  const sourceKindById = new Map((sources ?? []).map((source) => [source.id, source.kind]));
  const rows = await getMetricRowsForVerifiedApp(queryFor(app.id, app.currency, filters, filters.level), context.client);
  const filtered = filters.source ? rows.filter((row) => row.source_id && sourceIds.has(row.source_id)) : rows;
  const sort = sortableMetrics.has(filters.sort ?? "") ? filters.sort! : "revenue_minor";
  const direction = filters.direction === "asc" ? "asc" : "desc";
  const ordered = filtered.toSorted((left, right) => compareRows(left, right, filters.level, sort, direction));
  const pageSize = 20;
  const pageCount = Math.ceil(ordered.length / pageSize);
  const page = Math.min(filters.page, Math.max(pageCount, 1));
  const pageRows = ordered.slice((page - 1) * pageSize, page * pageSize).map((row, index) => ({
    ...row,
    displayName: rowName(row, filters.level) ?? "Sin nombre",
    key: `${filters.level}-${page}-${index}`,
    sourceKind: sourceKindById.get(row.source_id ?? "") ?? "other",
  }));
  const totals = await getMetricRowsForVerifiedApp(queryFor(app.id, app.currency, filters, "app"), context.client);
  const health = await readDataHealth(context.client, app.id, totals[0] ?? emptyMetric());
  return {
    ...context,
    direction,
    health,
    page,
    pageCount,
    rows: pageRows,
    sort,
    sources: [...new Map((sources ?? []).map((source) => [source.kind, source])).values()],
    total: ordered.length,
  };
}
