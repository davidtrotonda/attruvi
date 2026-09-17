import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@/lib/auth/session";
import { getAppsManagement } from "@/lib/data/apps";

const PAGE_SIZE = 25;

type ExplorerFilters = {
  app?: string;
  page?: string;
  payer?: string;
  platform?: string;
  user?: string;
  workspace?: string;
};

type UserMetricRow = {
  app_user_id: string;
  first_activity_at: string | null;
  first_install_at: string | null;
  first_purchase_at: string | null;
  installation_count: number;
  last_activity_at: string | null;
  ltv_currency: string;
  ltv_observed_minor: number | string;
  payer_status: "never_paid" | "refunded" | "reported" | "verified";
  revenue_reported_by_currency: Record<string, string>;
  session_count: number;
  signed_up_at: string | null;
};

type InstallationRow = {
  first_open_at: string;
  id: string;
  last_seen_at: string;
  platform: "android" | "ios";
};

type TimelineItem = {
  at: string;
  detail: string;
  id: string;
  kind: "click" | "event" | "installation" | "postback" | "revenue" | "session";
  label: string;
  meta?: string;
};

function pageNumber(raw?: string) {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function payerFilter(raw?: string) {
  return ["never_paid", "refunded", "reported", "verified"].includes(raw ?? "")
    ? raw
    : undefined;
}

function platformFilter(raw?: string): "android" | "ios" | undefined {
  return raw === "android" || raw === "ios" ? raw : undefined;
}

export async function getUserExplorer(identity: VerifiedIdentity, filters: ExplorerFilters) {
  const context = await getAppsManagement(identity, filters.app, filters.workspace);
  const selectedApp =
    context.apps.find((app) => app.id === filters.app) ??
    context.apps.find((app) => app.slug === filters.app) ??
    context.apps.find((app) => app.status === "active") ??
    context.apps[0] ??
    null;
  const page = pageNumber(filters.page);
  const payer = payerFilter(filters.payer);
  const platform = platformFilter(filters.platform);

  if (!selectedApp) {
    return { ...context, detail: null, filters: { page, payer, platform }, pageCount: 0, selectedApp: null, total: 0, users: [] };
  }

  let allowedUserIds: string[] | null = null;
  if (platform) {
    const { data: platformInstallations, error: installationError } = await context.client
      .from("installations")
      .select("id")
      .eq("app_id", selectedApp.id)
      .eq("platform", platform)
      .limit(10_000);
    if (installationError) throw new Error("No se ha podido aplicar el filtro de plataforma.");
    const installationIds = (platformInstallations ?? []).map((row) => row.id);
    if (installationIds.length === 0) {
      allowedUserIds = [];
    } else {
      const { data: links, error: linksError } = await context.client
        .from("app_user_installations")
        .select("app_user_id")
        .eq("app_id", selectedApp.id)
        .in("installation_id", installationIds);
      if (linksError) throw new Error("No se ha podido aplicar el filtro de plataforma.");
      allowedUserIds = [...new Set((links ?? []).map((row) => row.app_user_id))];
    }
  }

  let users: UserMetricRow[] = [];
  let total = 0;
  if (allowedUserIds === null || allowedUserIds.length > 0) {
    let query = context.client
      .from("app_user_metrics")
      .select(
        "app_user_id,installation_count,session_count,first_install_at,first_activity_at,last_activity_at,signed_up_at,first_purchase_at,revenue_reported_by_currency,ltv_observed_minor,ltv_currency,payer_status",
        { count: "exact" },
      )
      .eq("app_id", selectedApp.id);
    if (payer) query = query.eq("payer_status", payer);
    if (allowedUserIds) query = query.in("app_user_id", allowedUserIds);
    const start = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await query
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .order("app_user_id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error("No se han podido cargar los usuarios anonimizados.");
    users = (data ?? []) as UserMetricRow[];
    total = count ?? 0;
  }

  const detail = filters.user
    ? await getAnonymousUserTimeline(context.client, selectedApp.id, filters.user)
    : null;

  return {
    ...context,
    detail,
    filters: { page, payer, platform },
    pageCount: Math.ceil(total / PAGE_SIZE),
    selectedApp,
    total,
    users,
  };
}

async function getAnonymousUserTimeline(client: SupabaseClient, appId: string, appUserId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appUserId)) return null;

  const [{ data: profile, error: profileError }, { data: metrics, error: metricsError }] = await Promise.all([
    client.from("app_users").select("id,identified_at,deleted_at,first_seen_at,last_seen_at").eq("app_id", appId).eq("id", appUserId).maybeSingle(),
    client.from("app_user_metrics").select("app_user_id,installation_count,session_count,first_install_at,first_activity_at,last_activity_at,signed_up_at,first_purchase_at,revenue_reported_by_currency,revenue_verified_by_currency,ltv_observed_minor,ltv_currency,payer_status").eq("app_id", appId).eq("app_user_id", appUserId).maybeSingle(),
  ]);
  if (profileError || metricsError) throw new Error("No se ha podido cargar el perfil anónimo.");
  if (!profile || !metrics) return null;

  const { data: links, error: linksError } = await client
    .from("app_user_installations")
    .select("installation_id")
    .eq("app_id", appId)
    .eq("app_user_id", appUserId);
  if (linksError) throw new Error("No se han podido cargar las instalaciones del perfil.");
  const installationIds = (links ?? []).map((row) => row.installation_id);
  if (installationIds.length === 0) return { installations: [], metrics, profile, timeline: [] as TimelineItem[] };

  const [installationsResult, sessionsResult, eventsResult, revenueResult, attributionResult] = await Promise.all([
    client.from("installations").select("id,platform,first_open_at,last_seen_at").eq("app_id", appId).in("id", installationIds).order("first_open_at", { ascending: true }),
    client.from("activity_sessions").select("id,installation_id,started_at,last_activity_at,event_count").eq("app_id", appId).in("installation_id", installationIds).order("started_at", { ascending: true }).limit(500),
    client.from("events").select("id,name,occurred_at,attribution_source_name,attribution_campaign_name").eq("app_id", appId).in("installation_id", installationIds).order("occurred_at", { ascending: true }).limit(500),
    client.from("revenue_ledger").select("id,event_id,event_type,occurred_at,revenue_reported_minor,revenue_verified_minor,currency,validation_status,transaction_id").eq("app_id", appId).eq("app_user_id", appUserId).order("occurred_at", { ascending: true }).limit(500),
    client.from("attributions").select("installation_id,click_id,attributed_at,source_name,campaign_name").eq("app_id", appId).in("installation_id", installationIds).order("attributed_at", { ascending: true }).limit(100),
  ]);
  if ([installationsResult, sessionsResult, eventsResult, revenueResult, attributionResult].some((result) => result.error)) throw new Error("No se ha podido construir la línea temporal anónima.");

  const events = eventsResult.data ?? [];
  const eventIds = events.map((event) => event.id);
  const attributions = attributionResult.data ?? [];
  const clickIds = attributions.flatMap((attribution) => attribution.click_id ? [attribution.click_id] : []);
  const [clicksResult, postbacksResult] = await Promise.all([
    clickIds.length
      ? client.from("link_clicks").select("id,clicked_at,destination_platform").eq("app_id", appId).in("id", clickIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? client.from("postback_jobs").select("id,event_id,status,created_at,completed_at,attempt_count").eq("app_id", appId).in("event_id", eventIds).order("created_at", { ascending: true }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clicksResult.error || postbacksResult.error) throw new Error("No se ha podido completar la línea temporal anónima.");

  const timeline: TimelineItem[] = [];
  for (const click of clicksResult.data ?? []) {
    const attribution = attributions.find((row) => row.click_id === click.id);
    timeline.push({ at: click.clicked_at, detail: [attribution?.source_name, attribution?.campaign_name].filter(Boolean).join(" · ") || "Origen capturado", id: `click-${click.id}`, kind: "click", label: "Clic publicitario", meta: click.destination_platform ?? "destino automático" });
  }
  for (const installation of installationsResult.data ?? []) {
    timeline.push({ at: installation.first_open_at, detail: installation.platform === "ios" ? "Primera apertura en iOS" : "Primera apertura en Android", id: `installation-${installation.id}`, kind: "installation", label: "Instalación", meta: shortIdentifier(installation.id) });
  }
  for (const session of sessionsResult.data ?? []) {
    timeline.push({ at: session.started_at, detail: `${session.event_count} evento${session.event_count === 1 ? "" : "s"}`, id: `session-${session.id}`, kind: "session", label: "Sesión", meta: `hasta ${session.last_activity_at}` });
  }
  for (const event of events) {
    if (["purchase", "subscription_started", "subscription_renewed", "refund", "subscription_refunded"].includes(event.name)) continue;
    timeline.push({ at: event.occurred_at, detail: [event.attribution_source_name, event.attribution_campaign_name].filter(Boolean).join(" · ") || "Sin origen publicitario asociado", id: `event-${event.id}`, kind: "event", label: eventLabel(event.name) });
  }
  for (const entry of revenueResult.data ?? []) {
    timeline.push({ at: entry.occurred_at, detail: `${entry.revenue_reported_minor} ${entry.currency} en unidades menores`, id: `revenue-${entry.id}`, kind: "revenue", label: eventLabel(entry.event_type), meta: entry.validation_status === "verified" ? "Verificado" : "Declarado por la app" });
  }
  for (const postback of postbacksResult.data ?? []) {
    timeline.push({ at: postback.completed_at ?? postback.created_at, detail: `Estado: ${postback.status} · ${postback.attempt_count} intento${postback.attempt_count === 1 ? "" : "s"}`, id: `postback-${postback.id}`, kind: "postback", label: "Conversión enviada" });
  }
  timeline.sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
  const firstInstallAt = metrics.first_install_at ? new Date(metrics.first_install_at).getTime() : null;
  return {
    daysSinceInstall: firstInstallAt === null
      ? 0
      : Math.max(0, Math.floor((Date.now() - firstInstallAt) / 86_400_000)),
    installations: (installationsResult.data ?? []) as InstallationRow[],
    metrics: metrics as UserMetricRow & { revenue_verified_by_currency: Record<string, string> },
    profile,
    timeline,
  };
}

export function shortIdentifier(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function eventLabel(name: string) {
  const labels: Record<string, string> = {
    app_open: "Apertura", install: "Instalación registrada", purchase: "Compra", refund: "Reembolso",
    session_start: "Inicio de sesión", sign_up: "Registro", subscription_cancelled: "Suscripción cancelada",
    subscription_expired: "Suscripción expirada", subscription_refunded: "Suscripción reembolsada",
    subscription_renewed: "Suscripción renovada", subscription_started: "Suscripción iniciada",
  };
  return labels[name] ?? name;
}
