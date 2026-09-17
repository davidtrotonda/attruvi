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
  "subscription_expired",
  "subscription_refunded",
  "refund",
  "uninstall_inferred",
] as const;

export const reservedEventNameSchema = z.enum(reservedEventNames);

const basePropertiesSchema = z
  .object({
    platform: z.enum(["ios", "android"]),
    sdkVersion: z.string().min(1).max(64),
  })
  .strict();

const productSchema = z
  .object({
    productId: z.string().min(1).max(255),
    quantity: z.number().int().positive().max(1_000).default(1),
    valueMinor: bigintInputSchema.optional(),
  })
  .strict();

const revenuePropertiesSchema = basePropertiesSchema.extend({
  transactionId: z.string().min(1).max(255),
  valueMinor: bigintInputSchema,
  currency: currencySchema,
  orderId: z.string().min(1).max(255).optional(),
  quantity: z.number().int().positive().max(1_000).default(1),
  products: z.array(productSchema).max(100).default([]),
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
    name: z.literal("subscription_expired"),
    properties: basePropertiesSchema.extend({
      productId: z.string().min(1).max(255),
      subscriptionId: z.string().min(1).max(255),
    }),
  }),
  z.object({
    name: z.literal("refund"),
    properties: revenuePropertiesSchema.extend({
      originalTransactionId: z.string().min(1).max(255),
      valueMinor: bigintInputSchema.refine((value) => value < 0n, "Un reembolso debe ser negativo"),
    }),
  }),
  z.object({
    name: z.literal("subscription_refunded"),
    properties: subscriptionPropertiesSchema.extend({
      originalTransactionId: z.string().min(1).max(255),
      valueMinor: bigintInputSchema.refine((value) => value < 0n, "Un reembolso debe ser negativo"),
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

const sdkJsonPrimitiveSchema = z.union([
  z.string().max(2_048),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
type SdkJsonValue = z.infer<typeof sdkJsonPrimitiveSchema> | SdkJsonValue[] | { [key: string]: SdkJsonValue };
const sdkJsonValueSchema: z.ZodType<SdkJsonValue> = z.lazy(() =>
  z.union([
    sdkJsonPrimitiveSchema,
    z.array(sdkJsonValueSchema).max(50),
    z.record(z.string().min(1).max(80), sdkJsonValueSchema),
  ]),
);

export const sdkEnvironmentSchema = z.enum(["development", "staging", "production"]);
export const sdkPlatformSchema = z.enum(["ios", "android"]);
export const attributionScopeSchema = z.enum(["acquisition", "reengagement"]);
export const attributionMatchTypeSchema = z.enum([
  "direct_link",
  "install_referrer",
  "network_signal",
  "probabilistic",
  "organic",
  "manual",
]);

export const sdkAttributionSchema = z
  .object({
    method: z.enum(["direct_link", "install_referrer"]),
    capturedAt: utcDateTimeSchema,
    clickId: z.string().min(1).max(1024).optional(),
    source: z.string().min(1).max(1024).optional(),
    medium: z.string().min(1).max(1024).optional(),
    campaign: z.string().min(1).max(1024).optional(),
    content: z.string().min(1).max(1024).optional(),
    term: z.string().min(1).max(1024).optional(),
    campaignId: z.string().min(1).max(1024).optional(),
    adGroupId: z.string().min(1).max(1024).optional(),
    adId: z.string().min(1).max(1024).optional(),
    gclid: z.string().min(1).max(1024).optional(),
    gbraid: z.string().min(1).max(1024).optional(),
    wbraid: z.string().min(1).max(1024).optional(),
    fbclid: z.string().min(1).max(1024).optional(),
    ttclid: z.string().min(1).max(1024).optional(),
    deepLinkPath: z.string().min(1).max(1024).optional(),
  })
  .strict();

export const sdkEventEnvelopeSchema = z
  .object({
    eventId: eventIdSchema,
    installationId: installationIdSchema,
    anonymousId: z.uuid(),
    sessionId: z.uuid(),
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/),
    occurredAt: utcDateTimeSchema,
    idempotencyKey: z.string().min(8).max(255),
    properties: z.record(z.string(), sdkJsonValueSchema),
  })
  .strict()
  .superRefine((event, context) => {
    const revenueEvents = new Set([
      "purchase",
      "refund",
      "subscription_started",
      "subscription_renewed",
      "subscription_refunded",
    ]);
    if (revenueEvents.has(event.name)) {
      if (typeof event.properties.transactionId !== "string" || event.properties.transactionId.length === 0) {
        context.addIssue({ code: "custom", path: ["properties", "transactionId"], message: "transactionId es obligatorio" });
      }
      if (
        (typeof event.properties.valueMinor !== "string" || !/^-?\d+$/.test(event.properties.valueMinor)) &&
        (typeof event.properties.valueMinor !== "number" || !Number.isSafeInteger(event.properties.valueMinor))
      ) {
        context.addIssue({ code: "custom", path: ["properties", "valueMinor"], message: "valueMinor debe ser un entero" });
      }
      if (typeof event.properties.currency !== "string" || !/^[A-Z]{3}$/.test(event.properties.currency)) {
        context.addIssue({ code: "custom", path: ["properties", "currency"], message: "currency debe ser ISO 4217" });
      }
      if (
        (event.name === "refund" || event.name === "subscription_refunded") &&
        Number(event.properties.valueMinor) >= 0
      ) {
        context.addIssue({ code: "custom", path: ["properties", "valueMinor"], message: "un reembolso debe ser negativo" });
      }
      const quantity = event.properties.quantity;
      if (quantity !== undefined && (!Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 1_000)) {
        context.addIssue({ code: "custom", path: ["properties", "quantity"], message: "quantity debe estar entre 1 y 1000" });
      }
      const products = event.properties.products;
      if (products !== undefined && !Array.isArray(products)) {
        context.addIssue({ code: "custom", path: ["properties", "products"], message: "products debe ser una lista" });
      }
    }
    if (event.name.startsWith("subscription_")) {
      for (const property of ["productId", "subscriptionId"] as const) {
        if (typeof event.properties[property] !== "string" || event.properties[property].length === 0) {
          context.addIssue({ code: "custom", path: ["properties", property], message: `${property} es obligatorio` });
        }
      }
    }
    if ((event.name === "refund" || event.name === "subscription_refunded") &&
      (typeof event.properties.originalTransactionId !== "string" || event.properties.originalTransactionId.length === 0)) {
      context.addIssue({ code: "custom", path: ["properties", "originalTransactionId"], message: "originalTransactionId es obligatorio" });
    }
  });

export const sdkEventBatchSchema = z
  .object({
    batchId: z.uuid(),
    sentAt: utcDateTimeSchema,
    environment: sdkEnvironmentSchema,
    platform: sdkPlatformSchema,
    sdkVersion: z.string().min(1).max(64),
    identity: z
      .object({
        userId: z.string().min(1).max(255),
        traits: z.record(z.string(), sdkJsonValueSchema),
      })
      .strict()
      .optional(),
    attribution: sdkAttributionSchema.optional(),
    events: z.array(sdkEventEnvelopeSchema).min(1).max(100),
  })
  .strict()
  .superRefine((batch, context) => {
    const installationIds = new Set(batch.events.map((event) => event.installationId));
    if (installationIds.size !== 1) {
      context.addIssue({ code: "custom", path: ["events"], message: "un lote solo puede pertenecer a una instalación" });
    }
  });

const sdkClientContextSchema = z
  .object({
    installationId: installationIdSchema,
    anonymousId: z.uuid(),
    occurredAt: utcDateTimeSchema,
    environment: sdkEnvironmentSchema,
    platform: sdkPlatformSchema,
    sdkVersion: z.string().min(1).max(64),
    appVersion: z.string().min(1).max(64).optional(),
  })
  .strict();

export const sdkInstallationSchema = sdkClientContextSchema.extend({
  consent: z.enum(["granted", "limited"]),
  attribution: sdkAttributionSchema.optional(),
});

export const sdkIdentifySchema = sdkClientContextSchema.extend({
  userId: z.string().min(1).max(255),
  traits: z.record(z.string().min(1).max(80), sdkJsonValueSchema).default({}),
});

export const sdkAttributionQuerySchema = z
  .object({ installationId: installationIdSchema })
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
    method: attributionMatchTypeSchema,
    matchType: attributionMatchTypeSchema,
    scope: attributionScopeSchema,
    engagementId: z.uuid(),
    confidence: z.number().min(0).max(1),
    deterministic: z.boolean(),
    ruleVersion: z.string().min(1).max(64),
    decisionReason: z.string().min(1),
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
export type SdkEventEnvelope = z.output<typeof sdkEventEnvelopeSchema>;
export type SdkEventBatch = z.output<typeof sdkEventBatchSchema>;
export type SdkInstallation = z.output<typeof sdkInstallationSchema>;
export type SdkIdentify = z.output<typeof sdkIdentifySchema>;
export type Attribution = z.output<typeof attributionSchema>;
export type Postback = z.output<typeof postbackSchema>;

export function parseUtcDateTime(value: unknown): UtcDateTime {
  return utcDateTimeSchema.parse(value);
}
