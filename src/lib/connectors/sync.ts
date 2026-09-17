import "server-only";

import {
  ConnectorError,
  refreshConnectorCredentials,
  type ConnectorCredentials,
  type NormalizedAdCost,
} from "@attruvi/connectors";
import { createAdvertisingConnector } from "./runtime";
import { isRemoteConnectorProvider, providerEnvironment, type RemoteConnectorProvider } from "./catalog";
import { readConnectorCredentials, storeConnectorCredentials } from "./secrets";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type SyncRun = {
  api_version: string | null;
  attempt_count: number;
  connector_account_id: string;
  id: string;
  max_attempts: number;
  sync_from: string;
  sync_to: string;
};

type ConnectorAccountRow = {
  external_account_id: string | null;
  id: string;
  login_customer_id?: string | null;
  provider: string;
};

export function retryDelaySeconds(attempt: number, retryAfterSeconds?: number) {
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.min(retryAfterSeconds, 21_600);
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 21_600);
}

function serializableCost(row: NormalizedAdCost) {
  return {
    ...row,
    amountMinor: row.amountMinor.toString(),
    clicks: row.clicks.toString(),
    impressions: row.impressions.toString(),
  };
}

async function freshCredentials(provider: RemoteConnectorProvider, accountId: string, credentials: ConnectorCredentials) {
  if (!credentials.expiresAt || Date.parse(credentials.expiresAt) > Date.now() + 60_000) return credentials;
  const environment = providerEnvironment(provider);
  if (!environment.clientId || !environment.clientSecret || !credentials.refreshToken) throw new ConnectorError("token_expired", "The connector must be authorized again.");
  const refreshed = await refreshConnectorCredentials({
    clientId: environment.clientId,
    clientSecret: environment.clientSecret,
    credentials,
    provider,
  });
  await storeConnectorCredentials(accountId, refreshed);
  return refreshed;
}

async function processRun(run: SyncRun) {
  const service = createSupabaseServiceClient();
  const { data: accountData, error: accountError } = await service
    .from("connector_accounts")
    .select("id,provider,external_account_id")
    .eq("id", run.connector_account_id)
    .single();
  if (accountError || !accountData) throw new Error("connector_account_unavailable");
  const account = accountData as ConnectorAccountRow;
  if (!isRemoteConnectorProvider(account.provider) || !account.external_account_id) throw new Error("connector_configuration_invalid");
  const provider = account.provider;
  let credentials = await readConnectorCredentials(account.id);
  credentials = await freshCredentials(provider, account.id, credentials);
  const connector = createAdvertisingConnector(provider);
  const environment = providerEnvironment(provider);
  let cursor: string | undefined;
  let pageNumber = 0;
  do {
    const page = await connector.fetchCosts({
      accountExternalId: account.external_account_id,
      credentials,
      ...(cursor ? { cursor } : {}),
      ...(environment.developerToken ? { developerToken: environment.developerToken } : {}),
      from: run.sync_from,
      to: run.sync_to,
    });
    const { error: persistError } = await service.rpc("persist_ad_cost_page", {
      requested_connector_account_id: account.id,
      requested_rows: page.rows.map(serializableCost),
      requested_sync_run_id: run.id,
    });
    if (persistError) throw new Error("cost_page_persist_failed");
    cursor = page.nextCursor;
    pageNumber += 1;
    await service.from("connector_sync_runs").update({
      checkpoint: { cursor: cursor ?? null, page: pageNumber },
      cursor: cursor ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", run.id);
    if (pageNumber >= 100 && cursor) throw new Error("connector_page_limit_exceeded");
  } while (cursor);

  const completedAt = new Date().toISOString();
  await Promise.all([
    service.from("connector_sync_runs").update({
      checkpoint: { complete: true, page: pageNumber },
      cursor: null,
      error_code: null,
      error_message: null,
      finished_at: completedAt,
      locked_at: null,
      locked_by: null,
      status: "succeeded",
      updated_at: completedAt,
    }).eq("id", run.id),
    service.from("connector_accounts").update({
      connection_state: "ready",
      last_error_at: null,
      last_error_code: null,
      last_synced_at: completedAt,
      sync_cursor: {},
      updated_at: completedAt,
    }).eq("id", account.id),
  ]);
}

async function failRun(run: SyncRun, caught: unknown) {
  const service = createSupabaseServiceClient();
  const connectorError = caught instanceof ConnectorError ? caught : null;
  const code = connectorError?.code ?? (caught instanceof Error ? caught.message : "unknown_error");
  const tokenExpired = code === "token_expired";
  const retryable = Boolean(connectorError?.retryable) && run.attempt_count < run.max_attempts && !tokenExpired;
  const now = new Date();
  const nextAttempt = new Date(now.valueOf() + retryDelaySeconds(run.attempt_count, connectorError?.retryAfterSeconds) * 1000).toISOString();
  await Promise.all([
    service.from("connector_sync_runs").update({
      error_code: code.slice(0, 80),
      error_message: retryable ? "La red publicitaria pidió reintentar más tarde." : "La sincronización necesita atención.",
      finished_at: retryable ? null : now.toISOString(),
      locked_at: null,
      locked_by: null,
      next_attempt_at: nextAttempt,
      status: retryable ? "retryable_failed" : "permanently_failed",
      updated_at: now.toISOString(),
    }).eq("id", run.id),
    service.from("connector_accounts").update({
      connection_state: tokenExpired ? "reconnect_required" : retryable ? "ready" : "error",
      last_error_at: now.toISOString(),
      last_error_code: code.slice(0, 80),
      updated_at: now.toISOString(),
    }).eq("id", run.connector_account_id),
  ]);
}

export async function runAdvertisingCostSyncBatch(batchSize = 5) {
  const service = createSupabaseServiceClient();
  const { data: scheduled, error: scheduleError } = await service.rpc("schedule_due_connector_syncs", {
    requested_limit: 100,
  });
  if (scheduleError) throw new Error("No se han podido programar las sincronizaciones diarias.");
  const workerId = `vercel-${crypto.randomUUID()}`;
  const { data, error } = await service.rpc("claim_connector_sync_runs", { batch_size: batchSize, worker_id: workerId });
  if (error) throw new Error("No se han podido reclamar trabajos de costes.");
  const runs = (data ?? []) as SyncRun[];
  const results = await Promise.all(runs.map(async (run) => {
    try {
      await processRun(run);
      return "succeeded" as const;
    } catch (caught) {
      await failRun(run, caught);
      return "failed" as const;
    }
  }));
  return {
    claimed: runs.length,
    failed: results.filter((result) => result === "failed").length,
    scheduled: Number(scheduled ?? 0),
    succeeded: results.filter((result) => result === "succeeded").length,
  };
}
