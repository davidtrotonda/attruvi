import type { Attribution, EventEnvelope } from "@attruvi/core";

export interface AttruviConfiguration {
  readonly appKey: string;
  readonly endpoint: string;
  readonly environment: "development" | "production";
}

export interface AttruviClient {
  track(event: EventEnvelope): Promise<void>;
  getAttribution(): Promise<Attribution | null>;
}

export function validateConfiguration(input: AttruviConfiguration): AttruviConfiguration {
  if (!input.appKey.startsWith("attruvi_")) {
    throw new Error("appKey must start with attruvi_");
  }

  const endpoint = new URL(input.endpoint);
  if (input.environment === "production" && endpoint.protocol !== "https:") {
    throw new Error("production endpoint must use HTTPS");
  }

  return { ...input, endpoint: endpoint.toString().replace(/\/$/, "") };
}
