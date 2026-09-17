import "server-only";

import type { ConnectorProvider } from "@attruvi/connectors";

export const remoteConnectorProviders = ["google_ads", "meta_ads", "tiktok_ads"] as const;
export type RemoteConnectorProvider = (typeof remoteConnectorProviders)[number];

type ProviderCatalogEntry = {
  apiVersion: string;
  clientIdEnvironmentName: string;
  clientSecretEnvironmentName: string;
  developerTokenEnvironmentName?: string;
  documentationUrl: string;
  label: string;
  pendingSteps: readonly string[];
};

export const connectorCatalog: Record<RemoteConnectorProvider, ProviderCatalogEntry> = {
  google_ads: {
    apiVersion: "v25",
    clientIdEnvironmentName: "GOOGLE_ADS_CLIENT_ID",
    clientSecretEnvironmentName: "GOOGLE_ADS_CLIENT_SECRET",
    developerTokenEnvironmentName: "GOOGLE_ADS_DEVELOPER_TOKEN",
    documentationUrl: "https://developers.google.com/google-ads/api/docs/oauth/cloud-project",
    label: "Google Ads",
    pendingSteps: [
      "Activa Google Ads API en Google Cloud.",
      "Crea un cliente OAuth web y añade la URL callback que aparece abajo.",
      "Solicita un Developer Token de Google Ads.",
      "Guarda Client ID, Client Secret y Developer Token en Vercel.",
    ],
  },
  meta_ads: {
    apiVersion: "v26.0",
    clientIdEnvironmentName: "META_ADS_APP_ID",
    clientSecretEnvironmentName: "META_ADS_APP_SECRET",
    documentationUrl: "https://developers.facebook.com/docs/marketing-api/overview/authentication",
    label: "Meta Ads",
    pendingSteps: [
      "Crea una app de tipo Business en Meta for Developers.",
      "Configura Facebook Login for Business con la URL callback.",
      "Solicita ads_read y business_management.",
      "Guarda App ID y App Secret en Vercel.",
    ],
  },
  tiktok_ads: {
    apiVersion: "v1.3",
    clientIdEnvironmentName: "TIKTOK_ADS_APP_ID",
    clientSecretEnvironmentName: "TIKTOK_ADS_APP_SECRET",
    documentationUrl: "https://business-api.tiktok.com/portal/docs",
    label: "TikTok Ads",
    pendingSteps: [
      "Crea una app en TikTok for Business Developer.",
      "Activa acceso de lectura a cuentas y reporting.",
      "Registra exactamente la URL callback que aparece abajo.",
      "Guarda App ID y Secret en Vercel.",
    ],
  },
};

export function isRemoteConnectorProvider(value: string): value is RemoteConnectorProvider {
  return remoteConnectorProviders.includes(value as RemoteConnectorProvider);
}

export function providerEnvironment(provider: RemoteConnectorProvider) {
  const entry = connectorCatalog[provider];
  const clientId = process.env[entry.clientIdEnvironmentName]?.trim();
  const clientSecret = process.env[entry.clientSecretEnvironmentName]?.trim();
  const developerToken = entry.developerTokenEnvironmentName
    ? process.env[entry.developerTokenEnvironmentName]?.trim()
    : undefined;
  const configured = Boolean(clientId && clientSecret && (!entry.developerTokenEnvironmentName || developerToken));
  return { clientId, clientSecret, configured, developerToken, entry };
}

export function providerLabel(provider: ConnectorProvider): string {
  if (provider === "manual") return "Coste manual";
  return connectorCatalog[provider].label;
}
