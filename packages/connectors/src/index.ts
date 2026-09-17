export * from "./types.js";
export * from "./money.js";
export * from "./http.js";
export * from "./google-ads.js";
export * from "./meta-ads.js";
export * from "./tiktok-ads.js";
export * from "./manual.js";
export * from "./oauth.js";

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
