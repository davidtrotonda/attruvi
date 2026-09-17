import { z } from "zod";

export const sourceKindSchema = z.enum([
  "google_ads",
  "meta_ads",
  "tiktok_ads",
  "affiliate",
  "influencer",
  "organic",
  "other",
]);

export const destinationPlatformSchema = z.enum(["ios", "android", "web"]);
export const destinationModeSchema = z.enum(["auto", "ios", "android", "web"]);

const optionalTrackingValue = z.string().max(512).nullish();

export const smartLinkConfigSchema = z
  .object({
    appId: z.uuid(),
    attributionWindowDays: z.number().int().min(1).max(90),
    deepLinkPath: z.string().max(1024).nullable(),
    destinationMode: destinationModeSchema,
    destinations: z
      .object({
        android: z.url().optional(),
        ios: z.url().optional(),
        web: z.url().optional(),
      })
      .strict(),
    marketing: z
      .object({
        adGroupId: optionalTrackingValue,
        adGroupName: optionalTrackingValue,
        adId: optionalTrackingValue,
        adName: optionalTrackingValue,
        affiliateId: optionalTrackingValue,
        campaignId: optionalTrackingValue,
        campaignName: optionalTrackingValue,
        creatorId: optionalTrackingValue,
        sourceKind: sourceKindSchema,
      })
      .strict(),
    organizationId: z.uuid(),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
    smartLinkId: z.uuid(),
    status: z.literal("active"),
    utm: z.record(z.string(), z.string().max(512)),
    version: z.literal(1),
  })
  .strict();

export const clickMessageSchema = z
  .object({
    appId: z.uuid(),
    clickId: z.uuid(),
    clickedAt: z.iso.datetime({ offset: true }),
    dedupeKey: z.string().min(16).max(128),
    destinationPlatform: destinationPlatformSchema,
    fbclid: optionalTrackingValue,
    gbraid: optionalTrackingValue,
    gclid: optionalTrackingValue,
    isBot: z.boolean(),
    isTest: z.boolean(),
    networkPrefixHash: z.string().regex(/^[a-f0-9]{64}$/),
    organizationId: z.uuid(),
    platformHint: destinationPlatformSchema,
    referrerParameters: z.record(z.string(), z.string().max(1024)),
    requestId: z.uuid(),
    smartLinkId: z.uuid(),
    ttclid: optionalTrackingValue,
    userAgentHash: z.string().regex(/^[a-f0-9]{64}$/),
    utmParameters: z.record(z.string(), z.string().max(512)),
    wbraid: optionalTrackingValue,
  })
  .strict();

export type ClickMessage = z.output<typeof clickMessageSchema>;
export type DestinationPlatform = z.output<typeof destinationPlatformSchema>;
export type SmartLinkConfig = z.output<typeof smartLinkConfigSchema>;
