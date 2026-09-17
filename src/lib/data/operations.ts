import "server-only";

import type { VerifiedIdentity } from "@/lib/auth/session";
import { getDashboardContext, type DashboardSelection, type OrganizationRole } from "@/lib/data/dashboard-context";

const PAGE_SIZE = 25;
const EMPTY_POSTBACK_STATS = {
  average_latency_ms: 0,
  pending: 0,
  permanently_failed: 0,
  p95_latency_ms: 0,
  processing: 0,
  retryable_failed: 0,
  skipped: 0,
  succeeded: 0,
  success_rate: 0,
  total: 0,
};

export async function getEventsDashboard(
  identity: VerifiedIdentity,
  filters: DashboardSelection & { event?: string; from: string; page: number; to: string },
) {
  const context = await getDashboardContext(identity, filters);
  const app = context.selectedApp;
  if (!app) return { ...context, eventNames: [], events: [], page: 1, pageCount: 0, total: 0 };
  const from = `${filters.from}T00:00:00.000Z`;
  const to = `${filters.to}T23:59:59.999Z`;
  let query = context.client
    .from("events")
    .select("id,name,occurred_at,received_at,value_minor,currency,installation_id,attribution_source_name,attribution_campaign_name", { count: "exact" })
    .eq("app_id", app.id)
    .gte("occurred_at", from)
    .lte("occurred_at", to);
  if (filters.event) query = query.eq("name", filters.event);
  const start = (filters.page - 1) * PAGE_SIZE;
  const [{ data: events, count, error }, { data: names, error: namesError }] = await Promise.all([
    query.order("occurred_at", { ascending: false }).range(start, start + PAGE_SIZE - 1),
    context.client.from("events").select("name").eq("app_id", app.id).limit(10_000),
  ]);
  if (error || namesError) throw new Error("No se han podido cargar los eventos.");
  const total = count ?? 0;
  return {
    ...context,
    eventNames: [...new Set((names ?? []).map((row) => row.name))].sort(),
    events: events ?? [],
    page: filters.page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    total,
  };
}

export async function getPostbacksDashboard(
  identity: VerifiedIdentity,
  filters: DashboardSelection & { page: number; status?: string },
) {
  const context = await getDashboardContext(identity, filters);
  const app = context.selectedApp;
  if (!app) return { ...context, connectorAccounts: [], destinations: [], errors: [], jobs: [], lastSentAt: null, page: 1, pageCount: 0, stats: EMPTY_POSTBACK_STATS, total: 0 };
  let query = context.client
    .from("postback_jobs")
    .select("id,destination_id,status,attempt_count,max_attempts,last_error_code,last_http_status,latency_ms,skip_reason,provider_request_id,created_at,completed_at,next_attempt_at,replayed_from_job_id", { count: "exact" })
    .eq("app_id", app.id);
  if (filters.status) query = query.eq("status", filters.status);
  const start = (filters.page - 1) * PAGE_SIZE;
  const [jobsResult, destinationsResult, summaryResult, accountsResult] = await Promise.all([
    query.order("created_at", { ascending: false }).range(start, start + PAGE_SIZE - 1),
    context.client.from("postback_destinations").select("id,provider,name,event_name,provider_event_name,external_conversion_id,connector_account_id,status,send_value,value_mode,currency_mode,fixed_value_minor,fixed_currency,api_version,last_tested_at,last_test_status,last_test_error_code").eq("app_id", app.id).order("created_at", { ascending: true }),
    context.client.rpc("get_postback_dashboard_summary", { requested_app_id: app.id }),
    context.client.from("connector_accounts").select("id,provider,account_name,external_account_hint,connection_state,api_version").eq("app_id", app.id).in("provider", ["google_ads", "meta_ads", "tiktok_ads"]).order("created_at", { ascending: true }),
  ]);
  if (jobsResult.error || destinationsResult.error || summaryResult.error || accountsResult.error) throw new Error("No se han podido cargar los postbacks.");
  const destinations = destinationsResult.data ?? [];
  const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
  const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
  const stats: Record<string, number> = {
    average_latency_ms: Number(summary?.average_latency_ms ?? 0),
    pending: Number(summary?.pending ?? 0),
    permanently_failed: Number(summary?.permanently_failed ?? 0),
    p95_latency_ms: Number(summary?.p95_latency_ms ?? 0),
    processing: Number(summary?.processing ?? 0),
    retryable_failed: Number(summary?.retryable_failed ?? 0),
    skipped: Number(summary?.skipped ?? 0),
    succeeded: Number(summary?.succeeded ?? 0),
    success_rate: Number(summary?.success_rate ?? 0),
    total: Number(summary?.total ?? 0),
  };
  const total = jobsResult.count ?? 0;
  return {
    ...context,
    connectorAccounts: accountsResult.data ?? [],
    destinations,
    errors: Array.isArray(summary?.errors) ? summary.errors as Array<{ code: string; count: number }> : [],
    jobs: (jobsResult.data ?? []).map((job) => ({ ...job, destination: destinationById.get(job.destination_id) ?? null })),
    lastSentAt: summary?.last_sent_at as string | null | undefined,
    page: filters.page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    stats,
    total,
  };
}

type TeamMember = {
  display_name: string;
  email: string;
  joined_at: string;
  member_id: string;
  role: OrganizationRole;
  user_id: string;
};

export async function getSettingsDashboard(identity: VerifiedIdentity, selection: DashboardSelection) {
  const context = await getDashboardContext(identity, selection);
  const organization = context.organization;
  const app = context.selectedApp;
  if (!organization) return { ...context, invitations: [], members: [], platforms: [], sdkKeys: [] };
  const [teamResult, invitationsResult, platformsResult, keysResult] = await Promise.all([
    context.client.rpc("read_organization_team", { requested_organization_id: organization.id }),
    context.role === "owner"
      ? context.client.from("organization_invitations").select("id,email,role,status,expires_at,created_at").eq("organization_id", organization.id).eq("status", "pending").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    app
      ? context.client.from("app_platforms").select("platform,ios_bundle_id,android_package_name,store_url").eq("app_id", app.id)
      : Promise.resolve({ data: [], error: null }),
    app
      ? context.client.from("public_sdk_keys").select("id,visible_prefix,environment,status,last_used_at,created_at").eq("app_id", app.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamResult.error || invitationsResult.error || platformsResult.error || keysResult.error) throw new Error("No se han podido cargar los ajustes.");
  return {
    ...context,
    invitations: invitationsResult.data ?? [],
    members: (teamResult.data ?? []) as TeamMember[],
    platforms: platformsResult.data ?? [],
    sdkKeys: keysResult.data ?? [],
  };
}
