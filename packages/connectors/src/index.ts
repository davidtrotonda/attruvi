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

export type ReceiptValidationProvider = "app_store" | "google_play" | "revenuecat";

export interface ReceiptValidationRequest {
  readonly appId: string;
  readonly currency: string;
  readonly productId?: string;
  readonly providerReference: string;
  readonly reportedValueMinor: bigint;
  readonly transactionId: string;
}

export type ReceiptValidationResult =
  | {
      readonly status: "verified";
      readonly currency: string;
      readonly providerReferenceHash: string;
      readonly verifiedValueMinor: bigint;
    }
  | {
      readonly status: "rejected" | "retryable_error";
      readonly reasonCode: string;
    };

export interface ReceiptValidator {
  readonly provider: ReceiptValidationProvider;
  validate(request: ReceiptValidationRequest): Promise<ReceiptValidationResult>;
}

export function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be an ISO 4217 code");
  }
  return normalized;
}
