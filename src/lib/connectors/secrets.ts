import "server-only";

import { webcrypto } from "node:crypto";
import type { ConnectorCredentials } from "@attruvi/connectors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const KEY_VERSION = "aes-gcm-v1";

function encryptionKeyBytes() {
  const encoded = process.env.CONNECTOR_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("CONNECTOR_ENCRYPTION_KEY no está configurada.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 32) throw new Error("CONNECTOR_ENCRYPTION_KEY debe contener 32 bytes en base64.");
  return bytes;
}

async function key() {
  return webcrypto.subtle.importKey("raw", encryptionKeyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function storeConnectorCredentials(connectorAccountId: string, credentials: ConnectorCredentials) {
  const initializationVector = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const additionalData = new TextEncoder().encode(connectorAccountId);
  const ciphertext = await webcrypto.subtle.encrypt({ additionalData, name: "AES-GCM", iv: initializationVector }, await key(), plaintext);
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("store_connector_secret", {
    requested_connector_account_id: connectorAccountId,
    requested_encrypted_payload: Buffer.from(ciphertext).toString("base64"),
    requested_initialization_vector: Buffer.from(initializationVector).toString("base64"),
    requested_key_version: KEY_VERSION,
  });
  if (error) throw new Error("No se han podido guardar las credenciales cifradas.");
}

export async function readConnectorCredentials(connectorAccountId: string): Promise<ConnectorCredentials> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("read_connector_secret", {
    requested_connector_account_id: connectorAccountId,
  });
  const record = Array.isArray(data) ? data[0] : data;
  if (error || !record || record.key_version !== KEY_VERSION) throw new Error("Las credenciales del conector no están disponibles.");
  const plaintext = await webcrypto.subtle.decrypt(
    {
      additionalData: new TextEncoder().encode(connectorAccountId),
      name: "AES-GCM",
      iv: Buffer.from(record.initialization_vector, "base64"),
    },
    await key(),
    Buffer.from(record.encrypted_payload, "base64"),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<ConnectorCredentials>;
  if (typeof parsed.accessToken !== "string") throw new Error("Las credenciales cifradas no son válidas.");
  return {
    accessToken: parsed.accessToken,
    ...(typeof parsed.expiresAt === "string" ? { expiresAt: parsed.expiresAt } : {}),
    ...(typeof parsed.refreshToken === "string" ? { refreshToken: parsed.refreshToken } : {}),
    ...(typeof parsed.tokenType === "string" ? { tokenType: parsed.tokenType } : {}),
  };
}
