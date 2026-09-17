import type { MetricEnvironment } from "./query";

export type DirtyMetricDay = {
  app_id: string;
  environment: MetricEnvironment;
  metric_date: string;
  organization_id: string;
  reasons: string[];
};

export type MetricRecalculationGroup = {
  appId: string;
  dates: string[];
  environment: MetricEnvironment;
  from: string;
  to: string;
};

export function groupDirtyDays(days: DirtyMetricDay[]): MetricRecalculationGroup[] {
  const groups = new Map<string, MetricRecalculationGroup>();
  for (const day of days) {
    const key = `${day.app_id}:${day.environment}`;
    const group = groups.get(key) ?? {
      appId: day.app_id,
      dates: [],
      environment: day.environment,
      from: day.metric_date,
      to: day.metric_date,
    };
    group.dates.push(day.metric_date);
    if (day.metric_date < group.from) group.from = day.metric_date;
    if (day.metric_date > group.to) group.to = day.metric_date;
    groups.set(key, group);
  }
  return [...groups.values()];
}
