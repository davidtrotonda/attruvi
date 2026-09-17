import {
  deadLetterSchema,
  queuedIngestMessageSchema,
  type DeadLetter,
  type PersistenceResult,
  type QueuedIngestMessage,
} from "./contracts";
import type { MetricName } from "./router";
import { SupabasePersistenceError } from "./supabase";

export interface QueuePersistence {
  persist(messages: readonly QueuedIngestMessage[]): Promise<PersistenceResult>;
  deadLetter(message: DeadLetter): Promise<void>;
  metric(name: MetricName, value: number, dimensions: Record<string, string>): void;
  now(): Date;
}

function safeDeadLetter(
  queueMessageId: string,
  attempts: number,
  reason: DeadLetter["reason"],
  now: Date,
  message?: QueuedIngestMessage,
): DeadLetter {
  return deadLetterSchema.parse({
    version: 1,
    queueMessageId,
    requestId: message?.requestId ?? null,
    appId: message?.appId ?? null,
    failedAt: now.toISOString(),
    attempts,
    reason,
  });
}

async function moveToDeadLetter(
  message: Message<unknown>,
  runtime: QueuePersistence,
  reason: DeadLetter["reason"],
  parsed?: QueuedIngestMessage,
): Promise<void> {
  await runtime.deadLetter(safeDeadLetter(message.id, message.attempts, reason, runtime.now(), parsed));
  message.ack();
  runtime.metric("rejected", 1, { code: reason, appId: parsed?.appId ?? "unknown" });
}

export async function consumeIngestBatch(
  batch: MessageBatch<unknown>,
  runtime: QueuePersistence,
): Promise<void> {
  const valid: Array<{ queue: Message<unknown>; body: QueuedIngestMessage }> = [];
  for (const queueMessage of batch.messages) {
    const parsed = queuedIngestMessageSchema.safeParse(queueMessage.body);
    if (!parsed.success) {
      try {
        await moveToDeadLetter(queueMessage, runtime, "invalid_message");
      } catch {
        queueMessage.retry({ delaySeconds: 30 });
      }
      continue;
    }
    valid.push({ queue: queueMessage, body: parsed.data });
  }
  if (valid.length === 0) return;

  try {
    const result = await runtime.persist(valid.map(({ body }) => body));
    for (const { queue } of valid) queue.ack();
    const lag = Math.max(
      0,
      ...valid.map(({ body }) => runtime.now().getTime() - Date.parse(body.receivedAt)),
    );
    const appIds = new Set(valid.map(({ body }) => body.appId));
    const metricScope = appIds.size === 1 ? valid[0]!.body.appId : "mixed";
    runtime.metric("persisted", result.events + result.installations + result.identities, {
      appId: metricScope,
    });
    runtime.metric("lag", lag, { appId: metricScope });
  } catch (error) {
    const permanent = error instanceof SupabasePersistenceError && !error.transient;
    for (const item of valid) {
      if (permanent || item.queue.attempts >= 5) {
        try {
          await moveToDeadLetter(
            item.queue,
            runtime,
            permanent ? "permanent_database_rejection" : "retries_exhausted",
            item.body,
          );
        } catch {
          item.queue.retry({ delaySeconds: 60 });
        }
      } else {
        item.queue.retry({ delaySeconds: Math.min(300, 15 * 2 ** Math.max(0, item.queue.attempts - 1)) });
      }
    }
  }
}
