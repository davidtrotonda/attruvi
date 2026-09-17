import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/data/dashboard-context";
import {
  buildSmartLinkUrl,
  smartLinkSourceKinds,
  type SmartLinkSourceKind,
} from "@/lib/smart-links/shared";

type AppRow = {
  created_at: string;
  currency: string;
  id: string;
  name: string;
  session_timeout_minutes: number;
  slug: string;
  status: "active" | "disabled" | "paused";
  timezone: string;
};

type PlatformRow = {
  android_package_name: string | null;
  app_id: string;
  ios_bundle_id: string | null;
  platform: "android" | "ios";
};

type SmartLinkRow = {
  ad_group_id: string | null;
  ad_id: string | null;
  affiliate_id: string | null;
  app_id: string;
  attribution_window_days: number;
  campaign_id: string | null;
  created_at: string;
  creator_id: string | null;
  deep_link_path: string | null;
  destination_mode: "android" | "auto" | "ios" | "web";
  id: string;
  name: string;
  slug: string;
  source_id: string | null;
  status: "active" | "disabled" | "paused";
  updated_at: string;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_medium: string | null;
  utm_source: string | null;
  utm_term: string | null;
};

type DestinationRow = {
  destination_url: string;
  platform: "android" | "ios" | "web";
  smart_link_id: string;
};

type NamedMarketingRow = {
  external_id: string | null;
  id: string;
  name: string;
};

type SourceRow = NamedMarketingRow & { kind: SmartLinkSourceKind };

type ClickRow = {
  destination_platform: "android" | "ios" | "web" | null;
  is_bot: boolean;
  is_test: boolean;
  smart_link_id: string;
};

function sourceKind(value: string): SmartLinkSourceKind {
  return smartLinkSourceKinds.includes(value as SmartLinkSourceKind)
    ? (value as SmartLinkSourceKind)
    : "other";
}
async function readApps(client: SupabaseClient, organizationId: string) {
  const [{ data: appRows, error: appError }, { data: platformRows, error: platformError }] =
    await Promise.all([
      client
        .from("apps")
        .select("id,name,slug,status,currency,timezone,session_timeout_minutes,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      client
        .from("app_platforms")
        .select("app_id,platform,ios_bundle_id,android_package_name")
        .eq("organization_id", organizationId),
    ]);
  if (appError || platformError) throw new Error("No se han podido cargar las aplicaciones.");

  const platforms = (platformRows ?? []) as PlatformRow[];
  return ((appRows ?? []) as AppRow[]).map((app) => {
    const appPlatforms = platforms.filter((platform) => platform.app_id === app.id);
    return {
      ...app,
      sessionTimeoutMinutes: app.session_timeout_minutes,
      androidPackageName:
        appPlatforms.find((platform) => platform.platform === "android")?.android_package_name ?? null,
      iosBundleId:
        appPlatforms.find((platform) => platform.platform === "ios")?.ios_bundle_id ?? null,
      platform:
        appPlatforms.length > 1
          ? ("both" as const)
          : appPlatforms[0]?.platform ?? ("both" as const),
    };
  });
}

export async function getAppsManagement(
  identity: VerifiedIdentity,
  requestedApp?: string,
  requestedWorkspace?: string,
) {
  const dashboard = await getDashboardContext(identity, { app: requestedApp, workspace: requestedWorkspace });
  const { client, organization } = dashboard;
  if (!organization) throw new Error("No se ha podido cargar el proyecto.");
  const [apps, { data: linkRows, error: linkError }] = await Promise.all([
    readApps(client, organization.id),
    client.from("smart_links").select("app_id").eq("organization_id", organization.id),
  ]);
  if (linkError) throw new Error("No se han podido contar los enlaces.");
  const counts = new Map<string, number>();
  for (const link of linkRows ?? []) counts.set(link.app_id, (counts.get(link.app_id) ?? 0) + 1);
  return {
    apps: apps.map((app) => ({ ...app, smartLinkCount: counts.get(app.id) ?? 0 })),
    client,
    organization,
    role: dashboard.role,
    selectedApp: dashboard.selectedApp,
  };
}

export async function getSmartLinksManagement(
  identity: VerifiedIdentity,
  requestedAppId?: string,
  requestedWorkspace?: string,
) {
  const context = await getAppsManagement(identity, requestedAppId, requestedWorkspace);
  const selectedApp =
    context.apps.find((app) => app.id === requestedAppId) ??
    context.apps.find((app) => app.slug === requestedAppId) ??
    context.apps.find((app) => app.status === "active") ??
    context.apps[0] ??
    null;
  if (!selectedApp) return { ...context, links: [], selectedApp: null };

  const { data: linkData, error: linkError } = await context.client
    .from("smart_links")
    .select(
      "id,app_id,source_id,campaign_id,ad_group_id,ad_id,name,slug,status,attribution_window_days,destination_mode,utm_source,utm_medium,utm_campaign,utm_content,utm_term,affiliate_id,creator_id,deep_link_path,created_at,updated_at",
    )
    .eq("organization_id", context.organization.id)
    .eq("app_id", selectedApp.id)
    .order("created_at", { ascending: false });
  if (linkError) throw new Error("No se han podido cargar los enlaces.");
  const linkRows = (linkData ?? []) as SmartLinkRow[];

  const [destinationsResult, sourcesResult, campaignsResult, groupsResult, adsResult, clicksResult] =
    await Promise.all([
      context.client
        .from("link_destinations")
        .select("smart_link_id,platform,destination_url")
        .eq("app_id", selectedApp.id),
      context.client
        .from("sources")
        .select("id,name,kind,external_id")
        .eq("app_id", selectedApp.id),
      context.client
        .from("campaigns")
        .select("id,name,external_id")
        .eq("app_id", selectedApp.id),
      context.client
        .from("ad_groups")
        .select("id,name,external_id")
        .eq("app_id", selectedApp.id),
      context.client
        .from("ads")
        .select("id,name,external_id")
        .eq("app_id", selectedApp.id),
      context.client
        .from("link_clicks")
        .select("smart_link_id,destination_platform,is_bot,is_test")
        .eq("app_id", selectedApp.id)
        .order("clicked_at", { ascending: false })
        .limit(10_000),
    ]);

  const failed = [
    destinationsResult, sourcesResult, campaignsResult, groupsResult, adsResult, clicksResult,
  ].some((result) => result.error);
  if (failed) throw new Error("No se han podido cargar los detalles de los enlaces.");

  const destinations = (destinationsResult.data ?? []) as DestinationRow[];
  const sources = new Map(
    ((sourcesResult.data ?? []) as SourceRow[]).map((row) => [row.id, row]),
  );
  const campaigns = new Map(
    ((campaignsResult.data ?? []) as NamedMarketingRow[]).map((row) => [row.id, row]),
  );
  const groups = new Map(
    ((groupsResult.data ?? []) as NamedMarketingRow[]).map((row) => [row.id, row]),
  );
  const ads = new Map(
    ((adsResult.data ?? []) as NamedMarketingRow[]).map((row) => [row.id, row]),
  );
  const clicks = (clicksResult.data ?? []) as ClickRow[];

  const links = linkRows.map((link) => {
    const source = link.source_id ? sources.get(link.source_id) : undefined;
    const campaign = link.campaign_id ? campaigns.get(link.campaign_id) : undefined;
    const adGroup = link.ad_group_id ? groups.get(link.ad_group_id) : undefined;
    const ad = link.ad_id ? ads.get(link.ad_id) : undefined;
    const linkDestinations = destinations.filter(
      (destination) => destination.smart_link_id === link.id,
    );
    const linkClicks = clicks.filter((click) => click.smart_link_id === link.id);
    const validClicks = linkClicks.filter((click) => !click.is_bot && !click.is_test);
    const destination = (platform: DestinationRow["platform"]) =>
      linkDestinations.find((item) => item.platform === platform)?.destination_url ?? "";
    const sourceType = sourceKind(source?.kind ?? "other");
    const urlData = {
      adExternalId: ad?.external_id,
      adGroupExternalId: adGroup?.external_id,
      adGroupName: adGroup?.name,
      adName: ad?.name,
      affiliateId: link.affiliate_id,
      campaignExternalId: campaign?.external_id,
      campaignName: campaign?.name,
      creatorId: link.creator_id,
      deepLinkPath: link.deep_link_path,
      slug: link.slug,
      sourceKind: sourceType,
      utmCampaign: link.utm_campaign,
      utmContent: link.utm_content,
      utmMedium: link.utm_medium,
      utmSource: link.utm_source,
      utmTerm: link.utm_term,
    };

    return {
      ...link,
      adExternalId: ad?.external_id ?? "",
      adGroupExternalId: adGroup?.external_id ?? "",
      adGroupName: adGroup?.name ?? "",
      adName: ad?.name ?? "",
      androidUrl: destination("android"),
      campaignExternalId: campaign?.external_id ?? "",
      campaignName: campaign?.name ?? "",
      clicks: {
        android: validClicks.filter((click) => click.destination_platform === "android").length,
        bots: linkClicks.filter((click) => click.is_bot).length,
        ios: validClicks.filter((click) => click.destination_platform === "ios").length,
        tests: linkClicks.filter((click) => click.is_test).length,
        total: validClicks.length,
        web: validClicks.filter((click) => click.destination_platform === "web").length,
      },
      iosUrl: destination("ios"),
      publicUrl: buildSmartLinkUrl(urlData),
      sourceKind: sourceType,
      sourceName: source?.name ?? "Otro",
      testUrl: buildSmartLinkUrl(urlData, true),
      webUrl: destination("web"),
    };
  });

  return { ...context, links, selectedApp };
}
