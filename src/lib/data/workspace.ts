import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensurePersonalWorkspace,
  type VerifiedIdentity,
} from "@/lib/auth/session";

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

type MetricRow = {
  buyers: number | null;
  installs: number | null;
  revenue_minor: number | string | null;
  source_id: string | null;
  spend_minor: number | string | null;
};

function asBigInt(value: number | string | null) {
  if (value === null) return BigInt(0);
  return BigInt(String(value));
}

export async function getDashboardSnapshot(identity: VerifiedIdentity) {
  const workspace = await getWorkspace(identity);
  if (!workspace.app) return { ...workspace, snapshot: null };

  const [{ data: metricData, error: metricError }, { data: sourceData, error: sourceError }] =
    await Promise.all([
      workspace.client
        .from("daily_metrics")
        .select("source_id,spend_minor,revenue_minor,installs,buyers")
        .eq("app_id", workspace.app.id)
        .order("metric_date", { ascending: false })
        .limit(500),
      workspace.client
        .from("sources")
        .select("id,name,kind")
        .eq("app_id", workspace.app.id)
        .order("created_at", { ascending: true }),
    ]);

  if (metricError || sourceError) {
    throw new Error("No se han podido cargar las métricas del panel.");
  }

  const metrics = (metricData ?? []) as MetricRow[];
  const sources = new Map(
    (sourceData ?? []).map((source) => [source.id, source]),
  );
  const grouped = new Map<
    string,
    { buyers: number; installs: number; revenue: bigint; spend: bigint }
  >();

  for (const metric of metrics) {
    const sourceId = metric.source_id ?? "unknown";
    const current = grouped.get(sourceId) ?? {
      buyers: 0,
      installs: 0,
      revenue: BigInt(0),
      spend: BigInt(0),
    };
    current.buyers += metric.buyers ?? 0;
    current.installs += metric.installs ?? 0;
    current.revenue += asBigInt(metric.revenue_minor);
    current.spend += asBigInt(metric.spend_minor);
    grouped.set(sourceId, current);
  }

  const rows = [...grouped.entries()]
    .map(([sourceId, totals]) => ({
      ...totals,
      kind: sources.get(sourceId)?.kind ?? "other",
      name: sources.get(sourceId)?.name ?? "Sin fuente",
      revenueMinor: totals.revenue.toString(),
      spendMinor: totals.spend.toString(),
    }))
    .sort((left, right) => {
      if (left.revenue === right.revenue) return 0;
      return left.revenue > right.revenue ? -1 : 1;
    });

  const totals = rows.reduce(
    (result, row) => ({
      buyers: result.buyers + row.buyers,
      installs: result.installs + row.installs,
      revenue: result.revenue + row.revenue,
      spend: result.spend + row.spend,
    }),
    { buyers: 0, installs: 0, revenue: BigInt(0), spend: BigInt(0) },
  );

  return {
    ...workspace,
    snapshot: {
      rows,
      totals: {
        buyers: totals.buyers,
        installs: totals.installs,
        revenueMinor: totals.revenue.toString(),
        spendMinor: totals.spend.toString(),
      },
    },
  };
}
