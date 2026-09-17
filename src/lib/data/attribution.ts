import "server-only";

import { getAppsManagement } from "@/lib/data/apps";
import type { VerifiedIdentity } from "@/lib/auth/session";

type RuleRow = {
  acquisition_window_days: number;
  model: string;
  probabilistic_enabled: boolean;
  probabilistic_window_minutes: number;
  reengagement_window_hours: number;
  status: "active" | "archived" | "draft";
  version: string;
};

type AttributionRow = {
  ad_group_name: string | null;
  ad_name: string | null;
  attributed_at: string;
  campaign_name: string | null;
  confidence: number | string;
  decision_reason: string;
  engagement_id: string;
  id: string;
  installation_id: string;
  is_manual: boolean;
  match_type: string;
  rule_version: string;
  scope: "acquisition" | "reengagement";
  source_name: string | null;
};

type CandidateRow = {
  candidate_key: string;
  confidence: number | string;
  decision_reason: string;
  engagement_id: string;
  evidence: Record<string, unknown>;
  id: string;
  installation_id: string;
  is_winner: boolean;
  match_type: string;
  observed_at: string;
  rule_version: string;
  scope: "acquisition" | "reengagement";
  score: number;
};

type InstallationRow = {
  first_open_at: string;
  id: string;
  platform: "android" | "ios";
};

export async function getAttributionManagement(
  identity: VerifiedIdentity,
  requestedAppId?: string,
  requestedWorkspace?: string,
) {
  const context = await getAppsManagement(identity, requestedAppId, requestedWorkspace);
  const selectedApp =
    context.apps.find((app) => app.id === requestedAppId) ??
    context.apps.find((app) => app.slug === requestedAppId) ??
    context.apps.find((app) => app.status === "active") ??
    context.apps[0] ??
    null;

  if (!selectedApp) {
    return { ...context, candidates: [], decisions: [], rule: null, selectedApp: null };
  }

  const [rulesResult, attributionsResult, installationsResult, candidatesResult] =
    await Promise.all([
      context.client
        .from("attribution_rule_sets")
        .select(
          "version,status,model,acquisition_window_days,reengagement_window_hours,probabilistic_enabled,probabilistic_window_minutes",
        )
        .eq("app_id", selectedApp.id)
        .order("created_at", { ascending: false }),
      context.client
        .from("attributions")
        .select(
          "id,installation_id,scope,engagement_id,match_type,confidence,decision_reason,rule_version,attributed_at,is_manual,source_name,campaign_name,ad_group_name,ad_name",
        )
        .eq("app_id", selectedApp.id)
        .eq("is_current", true)
        .order("attributed_at", { ascending: false })
        .limit(50),
      context.client
        .from("installations")
        .select("id,platform,first_open_at")
        .eq("app_id", selectedApp.id)
        .order("first_open_at", { ascending: false })
        .limit(100),
      context.client
        .from("attribution_candidates")
        .select(
          "id,installation_id,scope,engagement_id,candidate_key,match_type,confidence,score,evidence,decision_reason,is_winner,rule_version,observed_at",
        )
        .eq("app_id", selectedApp.id)
        .order("observed_at", { ascending: false })
        .limit(500),
    ]);

  if (
    rulesResult.error ||
    attributionsResult.error ||
    installationsResult.error ||
    candidatesResult.error
  ) {
    throw new Error("No se ha podido cargar la explicación de atribución.");
  }

  const rules = (rulesResult.data ?? []) as RuleRow[];
  const installations = new Map(
    ((installationsResult.data ?? []) as InstallationRow[]).map((row) => [row.id, row]),
  );
  const candidates = (candidatesResult.data ?? []) as CandidateRow[];
  const decisions = ((attributionsResult.data ?? []) as AttributionRow[]).map((decision) => ({
    ...decision,
    confidence: Number(decision.confidence),
    installation: installations.get(decision.installation_id) ?? null,
    candidates: candidates
      .filter(
        (candidate) =>
          candidate.installation_id === decision.installation_id &&
          candidate.scope === decision.scope &&
          candidate.engagement_id === decision.engagement_id &&
          candidate.rule_version === decision.rule_version,
      )
      .map((candidate) => ({ ...candidate, confidence: Number(candidate.confidence) }))
      .sort(
        (left, right) =>
          Number(right.is_winner) - Number(left.is_winner) ||
          right.score - left.score ||
          right.observed_at.localeCompare(left.observed_at),
      ),
  }));

  return {
    ...context,
    decisions,
    rule: rules.find((rule) => rule.status === "active") ?? rules[0] ?? null,
    selectedApp,
  };
}
