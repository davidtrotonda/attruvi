import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensurePersonalWorkspace,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import {
  getMetricRowsForVerifiedApp,
  type MetricEnvironment,
  type MetricPlatform,
  type MetricRollupRow,
} from "@/lib/metrics/query";

type OnboardingDraft = {
  android_package_name?: string;
  app_name?: string;
  currency?: string;
  ios_bundle_id?: string;
  platform?: "android" | "both" | "ios";
  project_name?: string;
  timezone?: string;
};

export async function getWorkspace(identity: VerifiedIdentity) {
  const supabase = await createSupabaseServerClient();
  const ensured = await ensurePersonalWorkspace(supabase, identity.displayName);

  const [{ data: organization, error: organizationError }, { data: apps, error: appsError }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id,name,default_currency,default_timezone,onboarding_draft,onboarding_completed_at",
        )
        .eq("id", ensured.organizationId)
        .single(),
      supabase
        .from("apps")
        .select("id,name,currency,timezone,created_at")
        .eq("organization_id", ensured.organizationId)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

  if (organizationError || appsError || !organization) {
    throw new Error("No se ha podido cargar el espacio de trabajo.");
  }

  return {
    app: apps?.[0] ?? null,
    client: supabase,
    draft: (organization.onboarding_draft ?? {}) as OnboardingDraft,
    isComplete:
      Boolean(organization.onboarding_completed_at) || Boolean(apps?.[0]),
    organization,
  };
}

function asBigInt(value: number | string | null | undefined) {
  if (value === null) return BigInt(0);
  if (value === undefined) return BigInt(0);
  return BigInt(String(value));
}

export type DashboardMetricFilters = {
  environment: MetricEnvironment;
  from: string;
  platform?: MetricPlatform;
  to: string;
};

function toDashboardRow(metric: MetricRollupRow, kind: string) {
  return {
    buyers: metric.buyers,
    cacMinor: metric.cac_minor === null ? null : String(metric.cac_minor),
    clicks: metric.clicks,
    cpiMinor: metric.cpi_minor === null ? null : String(metric.cpi_minor),
    installs: metric.installs,
    kind,
    name: metric.source_name ?? "Sin fuente",
    registeredUsers: metric.registered_users,
    retentionD7: metric.retention_d7 === null ? null : String(metric.retention_d7),
    revenueMinor: asBigInt(metric.revenue_minor).toString(),
    roas: metric.roas === null ? null : String(metric.roas),
    sourceId: metric.source_id,
    spendMinor: asBigInt(metric.spend_minor).toString(),
  };
}

export async function getDashboardSnapshot(
  identity: VerifiedIdentity,
  filters: DashboardMetricFilters,
) {
  const workspace = await getWorkspace(identity);
  if (!workspace.app) return { ...workspace, snapshot: null };

  const queryBase = {
    appId: workspace.app.id,
    currency: workspace.app.currency,
    environment: filters.environment,
    from: filters.from,
    ...(filters.platform ? { platform: filters.platform } : {}),
    to: filters.to,
  } as const;
  const [totalsData, sourceMetrics, { data: sourceData, error: sourceError }] =
    await Promise.all([
      getMetricRowsForVerifiedApp({ ...queryBase, level: "app" }, workspace.client),
      getMetricRowsForVerifiedApp({ ...queryBase, level: "source" }, workspace.client),
      workspace.client
        .from("sources")
        .select("id,kind")
        .eq("app_id", workspace.app.id),
    ]);

  if (sourceError) {
    throw new Error("No se han podido cargar las métricas del panel.");
  }

  const sources = new Map(
    (sourceData ?? []).map((source) => [source.id, source]),
  );
  const rows = sourceMetrics.map((metric) =>
    toDashboardRow(metric, sources.get(metric.source_id ?? "")?.kind ?? "other"),
  );
  const totals = totalsData[0] ?? null;

  return {
    ...workspace,
    snapshot: {
      rows,
      totals: {
        buyers: totals?.buyers ?? 0,
        clicks: totals?.clicks ?? 0,
        installs: totals?.installs ?? 0,
        registeredUsers: totals?.registered_users ?? 0,
        retentionD7: totals?.retention_d7 === null || totals?.retention_d7 === undefined
          ? null
          : String(totals.retention_d7),
        revenueMinor: asBigInt(totals?.revenue_minor).toString(),
        roas: totals?.roas === null || totals?.roas === undefined ? null : String(totals.roas),
        spendMinor: asBigInt(totals?.spend_minor).toString(),
      },
    },
  };
}
