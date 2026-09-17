import type { QueuedIngestMessage } from "./contracts";
import type { AppKeyConfiguration } from "./contracts";
import type { AttributionView, IngestRuntime, MetricName } from "./router";

export class MemoryQueueAdapter {
  readonly messages: QueuedIngestMessage[] = [];

  async enqueue(message: QueuedIngestMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

export function createMemoryRuntime(options: {
  configuration: AppKeyConfiguration | null;
  now?: Date;
  attribution?: AttributionView | null;
}): IngestRuntime & {
  readonly queue: MemoryQueueAdapter;
  readonly metrics: Array<{ name: MetricName; value: number; dimensions: Record<string, string> }>;
  blockedScope: "app" | "ip" | "abuse" | null;
} {
  const queue = new MemoryQueueAdapter();
  const metrics: Array<{ name: MetricName; value: number; dimensions: Record<string, string> }> = [];
  let uuidCounter = 0;
  const runtime = {
    maximumRequestBytes: 262_144,
    queue,
    metrics,
    blockedScope: null as "app" | "ip" | "abuse" | null,
    now: () => options.now ?? new Date("2026-09-17T10:00:00.000Z"),
    randomUuid: () => `f0000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
    async resolveAppKey() {
      return options.configuration;
    },
    async rateLimit(scope: "app" | "ip" | "abuse") {
      return runtime.blockedScope !== scope;
    },
    enqueue: (message: QueuedIngestMessage) => queue.enqueue(message),
    async issueInstallationToken() {
      return { token: "test-installation-token-that-is-long-enough", hash: "a".repeat(64) };
    },
    async hash(value: string) {
      return `hash:${value}`.padEnd(64, "0").slice(0, 64);
    },
    async createProbabilisticEvidence(ipAddress: string, userAgent: string) {
      if (!ipAddress || !userAgent) return null;
      return { networkPrefixHash: "1".repeat(64), userAgentHash: "2".repeat(64) };
    },
    async readAttribution() {
      return options.attribution ?? null;
    },
    metric(name: MetricName, value: number, dimensions: Record<string, string>) {
      metrics.push({ name, value, dimensions });
    },
  };
  return runtime;
}
