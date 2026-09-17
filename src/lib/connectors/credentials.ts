import "server-only";

import { ConnectorError, refreshConnectorCredentials, type ConnectorCredentials } from "@attruvi/connectors";
import { providerEnvironment, type RemoteConnectorProvider } from "./catalog";
import { readConnectorCredentials, storeConnectorCredentials } from "./secrets";

export async function getFreshConnectorCredentials(provider: RemoteConnectorProvider, accountId: string) {
  let credentials: ConnectorCredentials;
  try {
    credentials = await readConnectorCredentials(accountId);
  } catch {
    throw new ConnectorError("configuration", "The connector credentials are not available.");
  }
  if (!credentials.expiresAt || Date.parse(credentials.expiresAt) > Date.now() + 60_000) return credentials;
  if (provider === "meta_ads") throw new ConnectorError("token_expired", "The Meta connector must be authorized again.");
  const environment = providerEnvironment(provider);
  if (!environment.clientId || !environment.clientSecret || !credentials.refreshToken) {
    throw new ConnectorError("token_expired", "The connector must be authorized again.");
  }
  const refreshed = await refreshConnectorCredentials({
    clientId: environment.clientId,
    clientSecret: environment.clientSecret,
    credentials,
    provider,
  });
  await storeConnectorCredentials(accountId, refreshed);
  return refreshed;
}
