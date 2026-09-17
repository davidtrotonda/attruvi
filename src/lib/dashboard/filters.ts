export type DashboardEnvironment = "development" | "production" | "staging";
export type DashboardPlatform = "android" | "ios";
export type DashboardLevel = "ad" | "ad_group" | "campaign";

export type DashboardSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function safeDate(value: string | string[] | undefined, fallback: string) {
  const candidate = one(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

export function parseDashboardFilters(params: DashboardSearchParams, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const rawFrom = safeDate(params.from, thirtyDaysAgo);
  const rawTo = safeDate(params.to, today);
  const environmentValue = one(params.environment);
  const platformValue = one(params.platform);
  const environment: DashboardEnvironment =
    environmentValue === "development" || environmentValue === "staging"
      ? environmentValue
      : "production";
  const platform: DashboardPlatform | undefined =
    platformValue === "android" || platformValue === "ios" ? platformValue : undefined;
  return {
    app: one(params.app),
    environment,
    from: rawFrom <= rawTo ? rawFrom : rawTo,
    platform,
    source: one(params.source),
    to: rawFrom <= rawTo ? rawTo : rawFrom,
    workspace: one(params.workspace),
  };
}

export function previousPeriod(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousTo = new Date(start.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * 86_400_000);
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

export function positivePage(value: string | string[] | undefined) {
  const parsed = Number(one(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function metricLevel(value: string | string[] | undefined): DashboardLevel {
  const candidate = one(value);
  return candidate === "ad_group" || candidate === "ad" ? candidate : "campaign";
}

export function firstParam(value: string | string[] | undefined) {
  return one(value);
}

export function dashboardHref(path: string, values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}
