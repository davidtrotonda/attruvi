export type ConnectorProvider = "google_ads" | "meta_ads" | "tiktok_ads" | "manual";
export type ConnectorHealth =
  | "pending_credentials"
  | "ready"
  | "syncing"
  | "reconnect_required"
  | "error"
  | "disabled";

export type ExternalEntityStatus = "active" | "paused" | "deleted" | "unknown";

export interface ConnectorCredentials {
  readonly accessToken: string;
  readonly expiresAt?: string;
  readonly refreshToken?: string;
  readonly tokenType?: string;
}

export interface OAuthDescriptor {
  readonly apiVersion: string;
  readonly authorizationEndpoint: string;
  readonly clientIdEnvironmentName: string;
  readonly clientSecretEnvironmentName: string;
  readonly scopes: readonly string[];
  readonly tokenEndpoint: string;
}

export interface ConnectorAccount {
  readonly currency?: string;
  readonly externalId: string;
  readonly name: string;
  readonly status: ExternalEntityStatus;
  readonly timezone?: string;
}

export interface ConnectorPage<T> {
  readonly rows: readonly T[];
  readonly nextCursor?: string;
}

export interface ConnectorContext {
  readonly accountExternalId: string;
  readonly credentials: ConnectorCredentials;
  readonly cursor?: string;
  readonly developerToken?: string;
  readonly from: string;
  readonly loginCustomerId?: string;
  readonly to: string;
}

export interface ConnectorAuthContext {
  readonly credentials: ConnectorCredentials;
  readonly cursor?: string;
  readonly developerToken?: string;
  readonly loginCustomerId?: string;
}

export interface ConnectorConnectionTest {
  readonly account?: ConnectorAccount;
  readonly message: string;
  readonly ok: boolean;
}

export interface NormalizedAdCost {
  readonly accountExternalId: string;
  readonly adExternalId?: string;
  readonly adGroupExternalId?: string;
  readonly adGroupName?: string;
  readonly adName?: string;
  readonly amountMinor: bigint;
  readonly campaignExternalId?: string;
  readonly campaignName?: string;
  readonly clicks: bigint;
  readonly costDate: string;
  readonly currency: string;
  readonly entityStatus: ExternalEntityStatus;
  readonly externalRowId: string;
  readonly impressions: bigint;
  readonly provider: ConnectorProvider;
}

export interface ConnectorStatusInput {
  readonly configured: boolean;
  readonly disabled?: boolean;
  readonly lastErrorCode?: string;
  readonly tokenExpiresAt?: string;
}

export interface AdvertisingConnector<TRaw = unknown> {
  readonly apiVersion: string;
  readonly oauth: OAuthDescriptor | null;
  readonly provider: ConnectorProvider;
  discoverAccounts(context: ConnectorAuthContext): Promise<ConnectorPage<ConnectorAccount>>;
  fetchCosts(context: ConnectorContext): Promise<ConnectorPage<NormalizedAdCost>>;
  normalize(raw: TRaw, context: Pick<ConnectorContext, "accountExternalId">): NormalizedAdCost;
  status(input: ConnectorStatusInput): ConnectorHealth;
  testConnection(context: ConnectorAuthContext & { readonly accountExternalId?: string }): Promise<ConnectorConnectionTest>;
}

export function connectorStatus(input: ConnectorStatusInput): ConnectorHealth {
  if (input.disabled) return "disabled";
  if (!input.configured) return "pending_credentials";
  if (input.lastErrorCode === "token_expired" || input.lastErrorCode === "invalid_grant") return "reconnect_required";
  if (input.lastErrorCode) return "error";
  if (input.tokenExpiresAt && Date.parse(input.tokenExpiresAt) <= Date.now()) return "reconnect_required";
  return "ready";
}

export function normalizeExternalStatus(value: unknown): ExternalEntityStatus {
  const status = typeof value === "string" || typeof value === "number" ? String(value).toUpperCase() : "";
  if (["ENABLED", "ACTIVE", "STATUS_ENABLE", "1"].includes(status)) return "active";
  if (["PAUSED", "DISABLED", "STATUS_DISABLE", "2"].includes(status)) return "paused";
  if (["REMOVED", "DELETED", "ARCHIVED", "STATUS_DELETE"].includes(status)) return "deleted";
  return "unknown";
}
