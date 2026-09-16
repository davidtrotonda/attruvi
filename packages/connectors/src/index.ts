import type { AdGroupId, AdId, CampaignId, SourceId, UtcDateTime } from "@attruvi/core";

export type ConnectorProvider = "google_ads" | "meta_ads" | "tiktok_ads" | "manual";

export interface ConnectorContext {
  readonly provider: ConnectorProvider;
  readonly cursor?: string;
  readonly from: UtcDateTime;
  readonly to: UtcDateTime;
}

export interface NormalizedAdCost {
  readonly sourceId: SourceId;
  readonly campaignId?: CampaignId;
  readonly adGroupId?: AdGroupId;
  readonly adId?: AdId;
  readonly spentAt: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly externalRowId: string;
}

export interface ConnectorPage<T> {
  readonly rows: readonly T[];
  readonly nextCursor?: string;
}

export interface AdvertisingConnector {
  readonly provider: ConnectorProvider;
  testConnection(): Promise<{ readonly ok: boolean; readonly message: string }>;
  fetchCosts(context: ConnectorContext): Promise<ConnectorPage<NormalizedAdCost>>;
}

export function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be an ISO 4217 code");
  }
  return normalized;
}
