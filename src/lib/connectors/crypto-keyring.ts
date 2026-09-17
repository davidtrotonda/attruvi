type Environment = Record<string, string | undefined>;

export type ConnectorKeyring = {
  activeVersion: string;
  keyBytes(version: string): Uint8Array;
};

function decodeKey(value: string, name: string) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error(`${name} debe contener exactamente 32 bytes en base64.`);
  return new Uint8Array(bytes);
}

export function connectorKeyring(env: Environment = process.env): ConnectorKeyring {
  const serialized = env.CONNECTOR_ENCRYPTION_KEYS?.trim();
  if (!serialized) {
    const legacy = env.CONNECTOR_ENCRYPTION_KEY?.trim();
    if (!legacy) throw new Error("El llavero de cifrado de conectores no está configurado.");
    const bytes = decodeKey(legacy, "CONNECTOR_ENCRYPTION_KEY");
    return {
      activeVersion: "aes-gcm-v1",
      keyBytes(version) {
        if (version !== "aes-gcm-v1") throw new Error("La versión de cifrado solicitada no está disponible.");
        return bytes;
      },
    };
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(serialized) as Record<string, string>;
  } catch {
    throw new Error("CONNECTOR_ENCRYPTION_KEYS no es un objeto JSON válido.");
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.some(([version, value]) => !version || typeof value !== "string")) {
    throw new Error("CONNECTOR_ENCRYPTION_KEYS no contiene claves válidas.");
  }
  const keys = new Map(entries.map(([version, value]) => [version, decodeKey(value, `clave ${version}`)]));
  const activeVersion = env.CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION?.trim();
  if (!activeVersion || !keys.has(activeVersion)) {
    throw new Error("La versión activa del llavero no existe.");
  }
  return {
    activeVersion,
    keyBytes(version) {
      const value = keys.get(version);
      if (!value) throw new Error("La versión de cifrado solicitada no está disponible.");
      return value;
    },
  };
}
