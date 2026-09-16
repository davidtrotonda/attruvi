import { z } from "zod";

declare const opaqueIdBrand: unique symbol;
declare const utcDateTimeBrand: unique symbol;

export type OpaqueId<Name extends string> = string & {
  readonly [opaqueIdBrand]: Name;
};

export type OrganizationId = OpaqueId<"Organization">;
export type AppId = OpaqueId<"App">;
export type SourceId = OpaqueId<"Source">;
export type CampaignId = OpaqueId<"Campaign">;
export type AdGroupId = OpaqueId<"AdGroup">;
export type AdId = OpaqueId<"Ad">;
export type SmartLinkId = OpaqueId<"SmartLink">;
export type ClickId = OpaqueId<"Click">;
export type InstallationId = OpaqueId<"Installation">;
export type AttributionId = OpaqueId<"Attribution">;
export type EventId = OpaqueId<"Event">;
export type PostbackId = OpaqueId<"Postback">;
export type UtcDateTime = string & { readonly [utcDateTimeBrand]: true };

const opaqueUuid = <Name extends string>() =>
  z.uuid().transform((value) => value as OpaqueId<Name>);

export const organizationIdSchema = opaqueUuid<"Organization">();
export const appIdSchema = opaqueUuid<"App">();
export const sourceIdSchema = opaqueUuid<"Source">();
export const campaignIdSchema = opaqueUuid<"Campaign">();
export const adGroupIdSchema = opaqueUuid<"AdGroup">();
export const adIdSchema = opaqueUuid<"Ad">();
export const smartLinkIdSchema = opaqueUuid<"SmartLink">();
export const clickIdSchema = opaqueUuid<"Click">();
export const installationIdSchema = opaqueUuid<"Installation">();
export const attributionIdSchema = opaqueUuid<"Attribution">();
export const eventIdSchema = opaqueUuid<"Event">();
export const postbackIdSchema = opaqueUuid<"Postback">();

export const utcDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString() as UtcDateTime);

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "La moneda debe ser un código ISO 4217 de tres letras");

const bigintInputSchema = z
  .union([z.bigint(), z.number().int().safe(), z.string().regex(/^-?\d+$/)])
  .transform((value) => BigInt(value))
  .refine(
    (value) => value >= -9_223_372_036_854_775_808n && value <= 9_223_372_036_854_775_807n,
    "El valor debe caber en un bigint de PostgreSQL",
  );

export const moneySchema = z.object({
  valueMinor: bigintInputSchema,
  currency: currencySchema,
});

export const reservedEventNames = [
  "install",
  "app_open",
  "session_start",
  "sign_up",
  "purchase",
  "subscription_started",
  "subscription_renewed",
  "subscription_cancelled",
  "uninstall_inferred",
] as const;

export const reservedEventNameSchema = z.enum(reservedEventNames);

const basePropertiesSchema = z
  .object({
    platform: z.enum(["ios", "android"]),
    sdkVersion: z.string().min(1).max(64),
  })
  .strict();

const revenuePropertiesSchema = basePropertiesSchema.extend({
  transactionId: z.string().min(1).max(255),
  valueMinor: bigintInputSchema,
  currency: currencySchema,
});

const subscriptionPropertiesSchema = revenuePropertiesSchema.extend({
  productId: z.string().min(1).max(255),
  subscriptionId: z.string().min(1).max(255),
});

export const eventPropertiesSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("install"), properties: basePropertiesSchema }),
  z.object({ name: z.literal("app_open"), properties: basePropertiesSchema }),
  z.object({ name: z.literal("session_start"), properties: basePropertiesSchema }),
  z.object({ name: z.literal("sign_up"), properties: basePropertiesSchema }),
  z.object({ name: z.literal("purchase"), properties: revenuePropertiesSchema }),
  z.object({ name: z.literal("subscription_started"), properties: subscriptionPropertiesSchema }),
  z.object({ name: z.literal("subscription_renewed"), properties: subscriptionPropertiesSchema }),
  z.object({
    name: z.literal("subscription_cancelled"),
    properties: basePropertiesSchema.extend({
      productId: z.string().min(1).max(255),
      subscriptionId: z.string().min(1).max(255),
    }),
  }),
  z.object({
    name: z.literal("uninstall_inferred"),
    properties: basePropertiesSchema.extend({
      evidence: z.string().min(1).max(500),
      confidence: z.number().min(0).max(1),
    }),
  }),
]);

export const eventEnvelopeSchema = z
  .object({
    eventId: eventIdSchema,
    appId: appIdSchema,
    installationId: installationIdSchema,
    occurredAt: utcDateTimeSchema,
    receivedAt: utcDateTimeSchema.optional(),
    idempotencyKey: z.string().min(8).max(255),
    event: eventPropertiesSchema,
  })
  .strict();

export const eventBatchSchema = z
  .object({
    batchId: z.uuid(),
    events: z.array(eventEnvelopeSchema).min(1).max(100),
  })
  .strict();

export const attributionSchema = z
  .object({
    id: attributionIdSchema,
    organizationId: organizationIdSchema,
    appId: appIdSchema,
    installationId: installationIdSchema,
    clickId: clickIdSchema.nullable(),
    sourceId: sourceIdSchema.nullable(),
    campaignId: campaignIdSchema.nullable(),
    adGroupId: adGroupIdSchema.nullable(),
    adId: adIdSchema.nullable(),
    method: z.enum(["direct_link", "install_referrer", "network_signal", "probabilistic", "organic"]),
    confidence: z.number().min(0).max(1),
    attributedAt: utcDateTimeSchema,
  })
  .strict();

export const postbackSchema = z
  .object({
    id: postbackIdSchema,
    organizationId: organizationIdSchema,
    appId: appIdSchema,
    eventId: eventIdSchema,
    provider: z.enum(["google_ads", "meta_ads", "tiktok_ads"]),
    status: z.enum(["pending", "processing", "succeeded", "retryable_failed", "permanently_failed", "skipped"]),
    createdAt: utcDateTimeSchema,
  })
  .strict();

export type EventEnvelope = z.output<typeof eventEnvelopeSchema>;
export type EventBatch = z.output<typeof eventBatchSchema>;
export type Attribution = z.output<typeof attributionSchema>;
export type Postback = z.output<typeof postbackSchema>;

export function parseUtcDateTime(value: unknown): UtcDateTime {
  return utcDateTimeSchema.parse(value);
}
