import { describe, expect, it } from "vitest";
import { connectorKeyring } from "./crypto-keyring";

describe("llavero de conectores", () => {
  it("mantiene versiones antiguas para descifrar durante una rotación", () => {
    const oldKey = Buffer.alloc(32, 1).toString("base64");
    const newKey = Buffer.alloc(32, 2).toString("base64");
    const ring = connectorKeyring({
      CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION: "v2",
      CONNECTOR_ENCRYPTION_KEYS: JSON.stringify({ v1: oldKey, v2: newKey }),
    });
    expect(ring.activeVersion).toBe("v2");
    expect(ring.keyBytes("v1")).toHaveLength(32);
    expect(ring.keyBytes("v2")).toHaveLength(32);
  });

  it("rechaza claves de tamaño incorrecto", () => {
    expect(() => connectorKeyring({ CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      "32 bytes",
    );
  });
});
