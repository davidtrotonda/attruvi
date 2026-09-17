import type { EventProperties, JsonValue, PropertyAllowlist } from "./types.js";

const PII_KEY = /(?:^|_)(?:email|e_mail|phone|telephone|first_name|last_name|full_name|address|street|postal|zip|latitude|longitude|lat|lng|ip|idfa|aaid|advertising_id)(?:$|_)/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE = /^\+?[\d\s().-]{8,}$/;

const RESERVED_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  purchase: ["transactionId", "valueMinor", "currency", "productId", "orderId"],
  subscription_started: ["transactionId", "valueMinor", "currency", "productId", "subscriptionId"],
  subscription_renewed: ["transactionId", "valueMinor", "currency", "productId", "subscriptionId"],
  subscription_cancelled: ["productId", "subscriptionId"],
};

function sanitizeValue(value: unknown, depth: number): JsonValue | undefined {
  if (depth > 3 || value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (EMAIL_VALUE.test(value) || PHONE_VALUE.test(value)) return undefined;
    return value.slice(0, 1_024);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((entry) => sanitizeValue(entry, depth + 1))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value).slice(0, 50)) {
      if (PII_KEY.test(key)) continue;
      const sanitized = sanitizeValue(nested, depth + 1);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }
  return undefined;
}

function allowedKeys(eventName: string, allowlist: PropertyAllowlist | undefined): Set<string> {
  return new Set([
    ...(RESERVED_PROPERTIES[eventName] ?? []),
    ...(allowlist?.all ?? []),
    ...(allowlist?.events?.[eventName] ?? []),
  ]);
}

export function sanitizeProperties(
  eventName: string,
  properties: EventProperties,
  allowlist?: PropertyAllowlist,
): Readonly<Record<string, JsonValue>> {
  const allowed = allowedKeys(eventName, allowlist);
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key) || PII_KEY.test(key)) continue;
    const sanitized = sanitizeValue(value, 0);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  if (JSON.stringify(output).length > 16_384) {
    throw new Error("Las propiedades del evento superan el límite de 16 KB");
  }
  return output;
}

export function sanitizeTraits(
  traits: EventProperties,
  allowlist?: PropertyAllowlist,
): Readonly<Record<string, JsonValue>> {
  const allowed = new Set(allowlist?.traits ?? []);
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(traits)) {
    if (!allowed.has(key) || PII_KEY.test(key)) continue;
    const sanitized = sanitizeValue(value, 0);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function validateEvent(name: string, properties: Readonly<Record<string, JsonValue>>): void {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(name)) {
    throw new Error("El nombre del evento debe tener entre 1 y 80 caracteres seguros");
  }
  if (name === "purchase" || name === "subscription_started" || name === "subscription_renewed") {
    if (!properties.transactionId || !properties.currency || properties.valueMinor === undefined) {
      throw new Error(`${name} requiere transactionId, valueMinor y currency`);
    }
    if (!/^[A-Z]{3}$/.test(String(properties.currency))) {
      throw new Error("currency debe ser un código ISO 4217 de tres letras");
    }
    if (!/^-?\d+$/.test(String(properties.valueMinor))) {
      throw new Error("valueMinor debe ser un entero en unidades menores");
    }
  }
  if (name.startsWith("subscription_")) {
    if (!properties.productId || !properties.subscriptionId) {
      throw new Error(`${name} requiere productId y subscriptionId`);
    }
  }
}
