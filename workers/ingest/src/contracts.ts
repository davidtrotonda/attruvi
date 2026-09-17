import {
  sdkEnvironmentSchema,
  sdkEventBatchSchema,
  sdkIdentifySchema,
  sdkInstallationSchema,
  sdkPlatformSchema,
} from "@attruvi/core";
import { z } from "zod";

export const appKeyConfigurationSchema = z
  .object({
    keyId: z.uuid(),
    organizationId: z.uuid(),
    appId: z.uuid(),
    environment: sdkEnvironmentSchema,
    status: z.enum(["active", "paused", "disabled", "revoked"]),
    appStatus: z.enum(["active", "paused", "disabled", "revoked"]),
    maxBatchEvents: z.number().int().min(1).max(100),
    maxRequestBytes: z.number().int().min(1_024).max(1_048_576),
    allowedSdkPrefixes: z.array(z.string().min(1).max(64)).min(1).max(10),
    allowedPlatforms: z.array(sdkPlatformSchema).min(1).max(2),
    attestationMode: z.enum(["off", "optional", "required"]),
    cacheTtlSeconds: z.number().int().min(5).max(300),
    probabilisticEnabled: z.boolean(),
  })
  .strict();

export type AppKeyConfiguration = z.output<typeof appKeyConfigurationSchema>;

const queuedBaseSchema = z.object({
  version: z.literal(1),
  requestId: z.uuid(),
  receivedAt: z.iso.datetime({ offset: true }),
  keyId: z.uuid(),
  organizationId: z.uuid(),
  appId: z.uuid(),
  environment: sdkEnvironmentSchema,
  logicalOrigin: z.string().min(1).max(128),
  attestation: z.enum(["absent", "unverified", "verified"]),
  probabilisticEvidence: z
    .object({
      networkPrefixHash: z.string().regex(/^[a-f0-9]{64}$/),
      userAgentHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .optional(),
});

export const queuedIngestMessageSchema = z.discriminatedUnion("kind", [
  queuedBaseSchema.extend({
    kind: z.literal("installation"),
    accessTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
    body: sdkInstallationSchema,
  }),
  queuedBaseSchema.extend({
    kind: z.literal("events"),
    body: sdkEventBatchSchema,
  }),
  queuedBaseSchema.extend({
    kind: z.literal("identify"),
    body: sdkIdentifySchema,
  }),
]);

export type QueuedIngestMessage = z.output<typeof queuedIngestMessageSchema>;

export const deadLetterSchema = z
  .object({
    version: z.literal(1),
    queueMessageId: z.string().min(1).max(255),
    requestId: z.uuid().nullable(),
    appId: z.uuid().nullable(),
    failedAt: z.iso.datetime({ offset: true }),
    attempts: z.number().int().nonnegative(),
    reason: z.enum(["invalid_message", "permanent_database_rejection", "retries_exhausted"]),
  })
  .strict();

export type DeadLetter = z.output<typeof deadLetterSchema>;

export const persistenceResultSchema = z
  .object({
    messages: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    installations: z.number().int().nonnegative(),
    identities: z.number().int().nonnegative(),
    attributions: z.number().int().nonnegative(),
  })
  .strict();

export type PersistenceResult = z.output<typeof persistenceResultSchema>;
