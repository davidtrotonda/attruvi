import type { ClickMessage, SmartLinkConfig } from "./contracts";
import type { LinkRuntime } from "./router";

export class LocalLinkRuntime implements LinkRuntime {
  readonly clicks: ClickMessage[] = [];
  readonly links = new Map<string, SmartLinkConfig>();
  readonly dedupeKeys = new Set<string>();
  now = () => new Date("2026-09-17T10:00:00.000Z");

  constructor(links: SmartLinkConfig[] = []) {
    for (const link of links) this.links.set(link.slug, link);
  }

  async enqueueClick(message: ClickMessage) {
    this.clicks.push(message);
  }

  async hash(value: string) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  async isDuplicate(dedupeKey: string) {
    if (this.dedupeKeys.has(dedupeKey)) return true;
    this.dedupeKeys.add(dedupeKey);
    return false;
  }

  async resolveLink(slug: string) {
    return this.links.get(slug) ?? null;
  }
}
