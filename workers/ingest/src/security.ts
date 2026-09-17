const forbiddenKeys = new Set([
  "address",
  "authorization",
  "email",
  "firstname",
  "lastname",
  "password",
  "phone",
  "phonenumber",
  "token",
]);

const forbiddenObjectKeys = new Set(["__proto__", "constructor", "prototype"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[\d\s().-]{8,}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UnsafePayloadError extends Error {
  constructor(readonly code: "payload_too_deep" | "payload_too_complex" | "pii_not_allowed" | "unsafe_property") {
    super(code);
  }
}

export function assertSafePayload(value: unknown): void {
  let nodes = 0;
  const visit = (current: unknown, depth: number, propertyKey?: string): void => {
    nodes += 1;
    if (nodes > 2_000) throw new UnsafePayloadError("payload_too_complex");
    if (depth > 8) throw new UnsafePayloadError("payload_too_deep");

    if (propertyKey) {
      const normalized = propertyKey.replace(/[_-]/g, "").toLowerCase();
      if (forbiddenObjectKeys.has(propertyKey)) throw new UnsafePayloadError("unsafe_property");
      if (forbiddenKeys.has(normalized)) throw new UnsafePayloadError("pii_not_allowed");
    }
    if (
      typeof current === "string" &&
      !uuidPattern.test(current) &&
      (emailPattern.test(current) || phonePattern.test(current))
    ) {
      throw new UnsafePayloadError("pii_not_allowed");
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1);
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) visit(child, depth + 1, key);
    }
  };
  visit(value, 0);
}

export async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RangeError("payload_too_large");
  }
  if (!request.body) throw new SyntaxError("missing_json_body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new RangeError("payload_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function validateDeviceTime(occurredAt: string, now: Date): "ok" | "future" | "too_old" {
  const timestamp = Date.parse(occurredAt);
  if (timestamp > now.getTime() + 10 * 60_000) return "future";
  if (timestamp < now.getTime() - 365 * 24 * 60 * 60_000) return "too_old";
  return "ok";
}
