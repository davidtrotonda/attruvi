import "server-only";

import type { VerifiedIdentity } from "@/lib/auth/session";
import { getDashboardContext, type DashboardSelection } from "@/lib/data/dashboard-context";
import { smartLinkBaseUrl } from "@/lib/smart-links/shared";
import {
  ATTRUVI_SDK_VERSION,
  buildSetupAiPrompt,
  buildSetupMarkdown,
  deriveSetupSteps,
  type SetupPlatform,
} from "@/lib/setup/assistant";

export type SetupDiagnostic = {
  action: string;
  detail: string;
  id: string;
  state: "fail" | "pass" | "warning";
  title: string;
};

type AssociationResult = { androidReady: boolean; iosReady: boolean; reachable: boolean };

async function readAssociationFiles(baseUrl: string, platforms: readonly SetupPlatform[]): Promise<AssociationResult> {
  if (/example\.com/i.test(baseUrl)) return { androidReady: false, iosReady: false, reachable: false };
  const iosBundleIds = platforms.flatMap((platform) => platform.iosBundleId ? [platform.iosBundleId] : []);
  const androidPackages = platforms.flatMap((platform) => platform.androidPackageName ? [platform.androidPackageName] : []);
  try {
    const [aasaResponse, assetlinksResponse] = await Promise.all([
      fetch(`${baseUrl}/.well-known/apple-app-site-association`, { cache: "no-store", signal: AbortSignal.timeout(3_500) }),
      fetch(`${baseUrl}/.well-known/assetlinks.json`, { cache: "no-store", signal: AbortSignal.timeout(3_500) }),
    ]);
    if (!aasaResponse.ok || !assetlinksResponse.ok) return { androidReady: false, iosReady: false, reachable: false };
    const [aasa, assetlinks] = await Promise.all([aasaResponse.json(), assetlinksResponse.json()]) as [
      { applinks?: { details?: Array<{ appIDs?: string[] }> } },
      Array<{ target?: { package_name?: string } }>,
    ];
    const appleIds = aasa.applinks?.details?.flatMap((entry) => entry.appIDs ?? []) ?? [];
    const packageNames = Array.isArray(assetlinks)
      ? assetlinks.flatMap((entry) => entry.target?.package_name ? [entry.target.package_name] : [])
      : [];
    return {
      androidReady: androidPackages.length === 0 || androidPackages.every((name) => packageNames.includes(name)),
      iosReady: iosBundleIds.length === 0 || iosBundleIds.every((bundle) => appleIds.some((id) => id === bundle || id.endsWith(`.${bundle}`))),
      reachable: true,
    };
  } catch {
    return { androidReady: false, iosReady: false, reachable: false };
  }
}

function identifierDiagnostics(platforms: readonly SetupPlatform[]): SetupDiagnostic[] {
  return platforms.map((platform) => {
    const value = platform.platform === "ios" ? platform.iosBundleId : platform.androidPackageName;
    const valid = Boolean(value && /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9_-]+)+$/.test(value));
    return {
      action: valid ? "No tienes que hacer nada." : `Corrige el ${platform.platform === "ios" ? "Bundle ID" : "package name"} en Apps.` ,
      detail: valid ? `${value} tiene un formato válido.` : "Falta el identificador o no tiene el formato esperado.",
      id: `identifier-${platform.platform}`,
      state: valid ? "pass" : "fail",
      title: platform.platform === "ios" ? "Bundle ID de iOS" : "Package name de Android",
    };
  });
}

export async function getSetupAssistant(identity: VerifiedIdentity, selection: DashboardSelection) {
  const context = await getDashboardContext(identity, selection);
  const selected = context.selectedApp;
  if (!selected) return { ...context, selectedApp: null };
  const linkBaseUrl = smartLinkBaseUrl();
  const ingestEndpoint = (process.env.ATTRUVI_INGEST_BASE_URL?.trim() || "https://ingest.example.com").replace(/\/+$/, "");

  const [platformsResult, keysResult, installationsResult, eventsResult, linksResult, clicksResult, connectorsResult, debugResult] = await Promise.all([
    context.client.from("app_platforms").select("platform,ios_bundle_id,android_package_name").eq("app_id", selected.id),
    context.client.from("public_sdk_keys").select("id,visible_prefix,environment,status,last_used_at,created_at").eq("app_id", selected.id).order("created_at", { ascending: false }),
    context.client.from("installations").select("id,environment,platform,sdk_version,first_open_at,last_seen_at").eq("app_id", selected.id).order("last_seen_at", { ascending: false }).limit(100),
    context.client.from("events").select("id,installation_id,name,received_at").eq("app_id", selected.id).order("received_at", { ascending: false }).limit(500),
    context.client.from("smart_links").select("id,slug,name,status").eq("app_id", selected.id).order("created_at", { ascending: false }).limit(100),
    context.client.from("link_clicks").select("id,smart_link_id,clicked_at,is_test").eq("app_id", selected.id).order("clicked_at", { ascending: false }).limit(100),
    context.client.from("connector_accounts").select("id,provider,connection_state,last_synced_at").eq("app_id", selected.id).in("provider", ["google_ads", "meta_ads", "tiktok_ads"]),
    context.client.from("development_debug_events").select("id,stage,status,title,detail,request_id,installation_id,event_id,metadata,occurred_at").eq("app_id", selected.id).order("occurred_at", { ascending: false }).limit(60),
  ]);
  const failed = [platformsResult, keysResult, installationsResult, eventsResult, linksResult, clicksResult, connectorsResult, debugResult].find((result) => result.error);
  if (failed?.error) throw new Error("No se ha podido cargar el asistente de configuración.");

  const platforms = (platformsResult.data ?? []).map((row) => ({
    androidPackageName: row.android_package_name,
    iosBundleId: row.ios_bundle_id,
    platform: row.platform,
  })) as SetupPlatform[];
  const installations = installationsResult.data ?? [];
  const developmentInstallationIds = new Set(installations.filter((row) => row.environment === "development").map((row) => row.id));
  const developmentEvents = (eventsResult.data ?? []).filter((event) => developmentInstallationIds.has(event.installation_id));
  const realInstallations = installations.filter((row) => row.environment === "development" && row.sdk_version && !row.sdk_version.includes("dashboard-test"));
  const latestRealInstallation = realInstallations[0] ?? null;
  const activeDevelopmentKey = (keysResult.data ?? []).find((key) => key.environment === "development" && key.status === "active") ?? null;
  const activeLink = (linksResult.data ?? []).find((link) => link.status === "active") ?? null;
  const association = await readAssociationFiles(linkBaseUrl, platforms);
  const associationReady = association.reachable && association.androidReady && association.iosReady;
  const debugEvents = debugResult.data ?? [];
  const connectedNetworks = (connectorsResult.data ?? []).filter((account) => account.connection_state === "ready").length;
  const steps = deriveSetupSteps({
    associationReady,
    connectedNetworks,
    debugStages: new Set(debugEvents.map((event) => event.stage)),
    eventNames: new Set(developmentEvents.map((event) => event.name)),
    hasActiveDevelopmentKey: Boolean(activeDevelopmentKey),
    hasActiveSmartLink: Boolean(activeLink),
    hasRealSdkInstallation: Boolean(latestRealInstallation),
    platforms,
  });

  const app = {
    currency: selected.currency,
    id: selected.id,
    name: selected.name,
    organizationName: selected.organizationName,
    slug: selected.slug,
    timezone: selected.timezone,
  };
  const diagnostics: SetupDiagnostic[] = [
    ...identifierDiagnostics(platforms),
    {
      action: associationReady ? "No tienes que hacer nada." : "Añade los identificadores reales a workers/links/src/association-config.ts y vuelve a desplegar el Worker.",
      detail: !association.reachable
        ? `No se pudieron leer AASA y assetlinks en ${linkBaseUrl}.`
        : associationReady ? "AASA y assetlinks incluyen los identificadores de esta app." : "Los archivos responden, pero todavía no incluyen todos los identificadores.",
      id: "associated-domains",
      state: associationReady ? "pass" : "warning",
      title: "Dominio y archivos asociados",
    },
    {
      action: /example\.com/i.test(ingestEndpoint) ? "Configura ATTRUVI_INGEST_BASE_URL en Vercel con el Worker de ingestión." : "No tienes que hacer nada.",
      detail: /example\.com/i.test(ingestEndpoint) ? "El endpoint sigue usando un placeholder." : `El SDK enviará a ${ingestEndpoint}.`,
      id: "ingest-endpoint",
      state: /example\.com/i.test(ingestEndpoint) ? "fail" : "pass",
      title: "Endpoint de ingestión",
    },
    {
      action: latestRealInstallation ? (latestRealInstallation.sdk_version === ATTRUVI_SDK_VERSION ? "No tienes que hacer nada." : `Actualiza @attruvi/react-native a ${ATTRUVI_SDK_VERSION}.`) : "Instala el SDK y abre una development build una vez.",
      detail: latestRealInstallation ? `Última versión detectada: ${latestRealInstallation.sdk_version}.` : "Aún no se ha detectado una app real; las simulaciones del dashboard no cuentan.",
      id: "sdk-version",
      state: !latestRealInstallation ? "warning" : latestRealInstallation.sdk_version === ATTRUVI_SDK_VERSION ? "pass" : "warning",
      title: "Versión del SDK",
    },
    {
      action: developmentEvents[0] ? "Abre el Debugger para revisar el recorrido." : "Envía un evento de prueba o abre la app con development.",
      detail: developmentEvents[0] ? `Último evento: ${developmentEvents[0].name}, recibido ${developmentEvents[0].received_at}.` : "Todavía no hay eventos de development.",
      id: "last-event",
      state: developmentEvents[0] ? "pass" : "warning",
      title: "Último evento",
    },
  ];

  return {
    ...context,
    activeDevelopmentKey,
    activeLink,
    aiPrompt: buildSetupAiPrompt({ app, endpoint: ingestEndpoint, linkDomain: new URL(linkBaseUrl).host, platforms }),
    clicks: clicksResult.data ?? [],
    connectedNetworks,
    debugEvents,
    diagnostics,
    ingestEndpoint,
    keys: keysResult.data ?? [],
    linkBaseUrl,
    markdown: buildSetupMarkdown({ app, endpoint: ingestEndpoint, linkDomain: new URL(linkBaseUrl).host, platforms }),
    platforms,
    prompts: steps.map((step) => buildSetupAiPrompt({ app, endpoint: ingestEndpoint, linkDomain: new URL(linkBaseUrl).host, platforms, step: step.id })),
    selectedApp: selected,
    steps,
  };
}
