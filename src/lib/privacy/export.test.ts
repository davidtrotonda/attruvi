import { describe, expect, it } from "vitest";
import { sanitizePrivacyExportRow } from "./export";

describe("sanitizePrivacyExportRow", () => {
  it("removes credential material while retaining useful app data", () => {
    expect(sanitizePrivacyExportRow("installations", {
      id: "installation-id",
      installation_access_token_hash: "sensitive-hash",
      installation_key_hash: "sensitive-hash",
      platform: "android",
    })).toEqual({ id: "installation-id", platform: "android" });

    expect(sanitizePrivacyExportRow("connector_accounts", {
      id: "connector-id",
      provider: "google",
      secret_reference: "encrypted-token-reference",
    })).toEqual({ id: "connector-id", provider: "google" });
  });

  it("does not mutate the database result", () => {
    const row = { id: "key-id", key_hash: "sensitive-hash" };
    expect(sanitizePrivacyExportRow("public_sdk_keys", row)).toEqual({ id: "key-id" });
    expect(row).toHaveProperty("key_hash");
  });
});
