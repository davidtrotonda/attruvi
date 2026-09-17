import "server-only";

import { webcrypto } from "node:crypto";
import type { ConnectorCredentials } from "@attruvi/connectors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { connectorKeyring } from "./crypto-keyring";

async function key(bytes: Uint8Array) {
  return webcrypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function storeConnectorCredentials(connectorAccountId: string, credentials: ConnectorCredentials) {
  const keyring = connectorKeyring();
  const initializationVector = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const additionalData = new TextEncoder().encode(connectorAccountId);
  const ciphertext = await webcrypto.subtle.encrypt(
    { additionalData, name: "AES-GCM", iv: initializationVector },
    await key(keyring.keyBytes(keyring.activeVersion)),
    plaintext,
  );
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("store_connector_secret", {
    requested_connector_account_id: connectorAccountId,
    requested_encrypted_payload: Buffer.from(ciphertext).toString("base64"),
    requested_initialization_vector: Buffer.from(initializationVector).toString("base64"),
    requested_key_version: keyring.activeVersion,
  });
  if (error) throw new Error("No se han podido guardar las credenciales cifradas.");
}

export async function readConnectorCredentials(connectorAccountId: string): Promise<ConnectorCredentials> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("read_connector_secret", {
    requested_connector_account_id: connectorAccountId,
  });
  const record = Array.isArray(data) ? data[0] : data;
  if (error || !record) throw new Error("Las credenciales del conector no están disponibles.");
  const keyring = connectorKeyring();
  const plaintext = await webcrypto.subtle.decrypt(
    {
      additionalData: new TextEncoder().encode(connectorAccountId),
      name: "AES-GCM",
      iv: Buffer.from(record.initialization_vector, "base64"),
    },
    await key(keyring.keyBytes(record.key_version)),
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

export async function rotateConnectorCredentials(connectorAccountId: string) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("read_connector_secret", {
    requested_connector_account_id: connectorAccountId,
  });
  const record = Array.isArray(data) ? data[0] : data;
  if (error || !record) throw new Error("Las credenciales del conector no están disponibles.");
  const keyring = connectorKeyring();
  if (record.key_version === keyring.activeVersion) return { rotated: false };
  const credentials = await readConnectorCredentials(connectorAccountId);
  await storeConnectorCredentials(connectorAccountId, credentials);
  await service.rpc("record_connector_secret_rotation", {
    requested_connector_account_id: connectorAccountId,
    requested_from_version: record.key_version,
    requested_to_version: keyring.activeVersion,
  });
  return { rotated: true };
}

export async function revokeConnectorCredentials(connectorAccountId: string) {
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("revoke_connector_secret", {
    requested_connector_account_id: connectorAccountId,
  });
  if (error) throw new Error("No se han podido revocar las credenciales del conector.");
}
