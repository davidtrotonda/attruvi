import "server-only";

import { providerEnvironment, remoteConnectorProviders } from "@/lib/connectors/catalog";
import { connectorCallbackUrl } from "@/lib/connectors/oauth";
import type { VerifiedIdentity } from "@/lib/auth/session";
import { getAppsManagement } from "./apps";

type ConnectorRow = {
  account_currency: string | null;
  account_name: string | null;
  api_version: string | null;
  connection_state: string;
  external_account_hint: string | null;
  id: string;
  last_error_code: string | null;
  last_synced_at: string | null;
  last_test_ok: boolean | null;
  provider: "google_ads" | "manual" | "meta_ads" | "tiktok_ads";
};

type CostRow = {
  ad_name: string | null;
  amount_minor: number | string;
  campaign_external_id: string | null;
  campaign_name: string | null;
  connector_account_id: string | null;
  cost_date: string;
  currency: string;
  external_account_id: string | null;
  id: string;
  match_status: string;
  provider: string;
  unmatched_reason: string | null;
};

type RunRow = {
  connector_account_id: string;
  created_at: string;
  error_code: string | null;
  finished_at: string | null;
  id: string;
  rows_written: number;
  status: string;
  sync_from: string | null;
  sync_to: string | null;
};

type TotalRow = { amount_minor: number | string; currency: string };

function configuredOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* use production domain */ }
  }
  return "https://www.attruvi.com";
}

export async function getAdvertisingCosts(identity: VerifiedIdentity, requestedAppId?: string, requestedWorkspace?: string) {
  const context = await getAppsManagement(identity, requestedAppId, requestedWorkspace);
  const selectedApp = context.apps.find((app) => app.id === requestedAppId) ?? context.apps.find((app) => app.slug === requestedAppId) ?? context.apps.find((app) => app.status === "active") ?? context.apps[0] ?? null;
  const configurations = remoteConnectorProviders.map((provider) => {
    const environment = providerEnvironment(provider);
    return {
      apiVersion: environment.entry.apiVersion,
      callbackUrl: connectorCallbackUrl(provider, configuredOrigin()),
      configured: environment.configured,
      documentationUrl: environment.entry.documentationUrl,
      environmentNames: [
        environment.entry.clientIdEnvironmentName,
        environment.entry.clientSecretEnvironmentName,
        ...(environment.entry.developerTokenEnvironmentName ? [environment.entry.developerTokenEnvironmentName] : []),
      ],
      label: environment.entry.label,
      pendingSteps: environment.entry.pendingSteps,
      provider,
    };
  });
  if (!selectedApp) return { ...context, campaigns: [], configurations, connectors: [], runs: [], selectedApp: null, spendByCurrency: [], unmatched: [], unmatchedCount: 0 };

  const [connectorsResult, totalsResult, runsResult, campaignsResult, unmatchedResult] = await Promise.all([
    context.client
      .from("connector_accounts")
      .select("id,provider,external_account_hint,account_name,account_currency,api_version,connection_state,last_synced_at,last_test_ok,last_error_code")
      .eq("app_id", selectedApp.id)
      .order("created_at", { ascending: true }),
    context.client.rpc("read_ad_cost_totals", { requested_app_id: selectedApp.id }),
    context.client
      .from("connector_sync_runs")
      .select("id,connector_account_id,status,sync_from,sync_to,rows_written,error_code,created_at,finished_at")
      .eq("app_id", selectedApp.id)
      .order("created_at", { ascending: false })
      .limit(20),
    context.client
      .from("campaigns")
      .select("id,name,external_id,source_id")
      .eq("app_id", selectedApp.id)
      .order("name"),
    context.client
      .from("ad_costs")
      .select("id,connector_account_id,provider,cost_date,amount_minor,currency,campaign_external_id,campaign_name,ad_name,match_status,unmatched_reason,external_account_id", { count: "exact" })
      .eq("app_id", selectedApp.id)
      .in("match_status", ["unmatched", "partially_matched"])
      .order("imported_at", { ascending: false })
      .limit(50),
  ]);
  if (connectorsResult.error || totalsResult.error || runsResult.error || campaignsResult.error || unmatchedResult.error) throw new Error("No se han podido cargar los costes publicitarios.");
  const totals = (totalsResult.data ?? []) as TotalRow[];
  return {
    ...context,
    campaigns: campaignsResult.data ?? [],
    configurations,
    connectors: (connectorsResult.data ?? []) as ConnectorRow[],
    runs: (runsResult.data ?? []) as RunRow[],
    selectedApp,
    spendByCurrency: totals.map((total) => ({ amountMinor: BigInt(total.amount_minor), currency: total.currency })),
    unmatched: (unmatchedResult.data ?? []) as CostRow[],
    unmatchedCount: unmatchedResult.count ?? unmatchedResult.data?.length ?? 0,
  };
}
