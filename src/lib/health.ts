type HealthEnvironment = Record<string, string | undefined>;

export type HealthPayload = {
  environment: "development" | "preview" | "production" | "unknown";
  release: string;
  requestId: string;
  service: "attruvi-web";
  status: "ok" | "degraded";
  timestamp: string;
};

export type DependencyHealth = {
  httpStatus: number | null;
  latencyMs: number;
  status: "ok" | "misconfigured" | "unreachable" | "unhealthy";
};

type HealthFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function publicEnvironment(value: string | undefined): HealthPayload["environment"] {
  return value === "development" || value === "preview" || value === "production" ? value : "unknown";
}

function publicRelease(env: HealthEnvironment) {
  const candidate = env.VERCEL_GIT_COMMIT_SHA?.trim() || env.ATTRUVI_RELEASE?.trim();
  return candidate ? candidate.slice(0, 12) : "local";
}

export function createHealthPayload(
  requestId: string,
  now = new Date(),
  env: HealthEnvironment = process.env,
): HealthPayload {
  return {
    environment: publicEnvironment(env.VERCEL_ENV),
    release: publicRelease(env),
    requestId,
    service: "attruvi-web",
    status: "ok",
    timestamp: now.toISOString(),
  };
}

export async function probeHealthDependency(
  baseUrl: string | undefined,
  expectedService: "attruvi-ingest" | "attruvi-links",
  fetcher: HealthFetcher = fetch,
  now: () => number = () => performance.now(),
): Promise<DependencyHealth> {
  const startedAt = now();
  if (!baseUrl?.trim()) {
    return { httpStatus: null, latencyMs: 0, status: "misconfigured" };
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/health", baseUrl);
    if (endpoint.protocol !== "https:") throw new Error("https_required");
  } catch {
    return { httpStatus: null, latencyMs: Math.max(0, Math.round(now() - startedAt)), status: "misconfigured" };
  }

  try {
    const response = await fetcher(endpoint, {
      cache: "no-store",
      headers: { "User-Agent": "attruvi-health/1.0" },
      signal: AbortSignal.timeout(3_000),
    });
    const latencyMs = Math.max(0, Math.round(now() - startedAt));
    if (!response.ok) return { httpStatus: response.status, latencyMs, status: "unhealthy" };
    const body = (await response.json()) as { service?: unknown; status?: unknown };
    return {
      httpStatus: response.status,
      latencyMs,
      status: body.service === expectedService && body.status === "ok" ? "ok" : "unhealthy",
    };
  } catch {
    return {
      httpStatus: null,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      status: "unreachable",
    };
  }
}
