type HealthEnvironment = Record<string, string | undefined>;

export type HealthPayload = {
  environment: "development" | "preview" | "production" | "unknown";
  release: string;
  requestId: string;
  service: "attruvi-web";
  status: "ok";
  timestamp: string;
};

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
