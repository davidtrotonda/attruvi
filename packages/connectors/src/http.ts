export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ConnectorErrorCode = "configuration" | "invalid_response" | "rate_limited" | "remote_error" | "token_expired";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryAfterSeconds: number | undefined;
  readonly retryable: boolean;

  constructor(code: ConnectorErrorCode, message: string, options: { retryable?: boolean; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export async function requestJson<T>(fetcher: FetchLike, url: string | URL, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  if (response.status === 401 || response.status === 403) throw new ConnectorError("token_expired", "The advertising token is invalid or expired.");
  if (response.status === 429) {
    const parsed = Number(response.headers.get("retry-after") ?? "60");
    throw new ConnectorError("rate_limited", "The advertising API rate limit was reached.", {
      retryAfterSeconds: Number.isFinite(parsed) && parsed > 0 ? parsed : 60,
      retryable: true,
    });
  }
  if (response.status >= 500) throw new ConnectorError("remote_error", "The advertising API is temporarily unavailable.", { retryable: true });
  if (!response.ok) throw new ConnectorError("remote_error", `Advertising API returned HTTP ${response.status}.`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ConnectorError("invalid_response", "Advertising API returned invalid JSON.");
  }
}

export function bearerHeaders(token: string, extra: Record<string, string> = {}): HeadersInit {
  if (!token.trim()) throw new ConnectorError("configuration", "An access token is required.");
  return { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra };
}
