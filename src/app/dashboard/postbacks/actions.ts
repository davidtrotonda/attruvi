"use server";

import { decimalToMinor, normalizeCurrency, type PostbackProvider } from "@attruvi/connectors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getDashboardContext } from "@/lib/data/dashboard-context";
import { createAdvertisingConnector } from "@/lib/connectors/runtime";
import { getFreshConnectorCredentials } from "@/lib/connectors/credentials";
import { isRemoteConnectorProvider, providerEnvironment } from "@/lib/connectors/catalog";
import { createPostbackAdapter } from "@/lib/postbacks/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const mappingSchema = z.object({
  app: z.string().trim().min(1).max(80),
  connectorAccountId: z.uuid(),
  currencyMode: z.enum(["app", "event", "fixed"]),
  eventName: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  externalConversionId: z.string().trim().min(1).max(255),
  fixedCurrency: z.string().trim().max(3).default(""),
  fixedValue: z.string().trim().max(40).default(""),
  provider: z.enum(["google_ads", "meta_ads", "tiktok_ads"]),
  providerEventName: z.string().trim().min(1).max(120),
  status: z.enum(["active", "paused"]),
  testEventCode: z.string().trim().max(120).default(""),
  valueMode: z.enum(["event", "fixed", "none"]),
  workspace: z.string().trim().min(1).max(80),
});

const providerConfiguration = {
  google_ads: { apiVersion: "v25", mode: "google_click_conversion" },
  meta_ads: { apiVersion: "v26.0", mode: "meta_conversions_api" },
  tiktok_ads: { apiVersion: "v1.3", mode: "tiktok_events_api_v2" },
} as const;

function postbacksUrl(app: string, workspace: string, result: string) {
  return `/dashboard/postbacks?workspace=${encodeURIComponent(workspace)}&app=${encodeURIComponent(app)}&${result}`;
}

async function editableContext(app: string, workspace: string) {
  const identity = await requireVerifiedIdentity();
  const context = await getDashboardContext(identity, { app, workspace });
  if (!context.selectedApp || context.selectedApp.slug !== app || context.selectedApp.organizationSlug !== workspace || !["owner", "admin"].includes(context.role)) {
    throw new Error("postback_configuration_forbidden");
  }
  return context;
}

export async function savePostbackDestinationAction(formData: FormData) {
  const parsed = mappingSchema.safeParse({
    app: String(formData.get("app") ?? ""),
    connectorAccountId: String(formData.get("connector_account_id") ?? ""),
    currencyMode: String(formData.get("currency_mode") ?? "event"),
    eventName: String(formData.get("event_name") ?? ""),
    externalConversionId: String(formData.get("external_conversion_id") ?? ""),
    fixedCurrency: String(formData.get("fixed_currency") ?? ""),
    fixedValue: String(formData.get("fixed_value") ?? ""),
    provider: String(formData.get("provider") ?? ""),
    providerEventName: String(formData.get("provider_event_name") ?? ""),
    status: String(formData.get("status") ?? "paused"),
    testEventCode: String(formData.get("test_event_code") ?? ""),
    valueMode: String(formData.get("value_mode") ?? "event"),
    workspace: String(formData.get("workspace") ?? ""),
  });
  if (!parsed.success) redirect("/dashboard/postbacks?error=invalid_mapping");
  const input = parsed.data;
  const context = await editableContext(input.app, input.workspace);
  const app = context.selectedApp!;
  const { data: account, error: accountError } = await context.client
    .from("connector_accounts")
    .select("id,provider,connection_state")
    .eq("id", input.connectorAccountId)
    .eq("app_id", app.id)
    .single();
  if (accountError || !account || account.provider !== input.provider) redirect(postbacksUrl(input.app, input.workspace, "error=account"));
  if (input.status === "active" && !["ready", "error"].includes(account.connection_state)) redirect(postbacksUrl(input.app, input.workspace, "error=credentials"));

  let fixedValueMinor: string | null = null;
  let fixedCurrency: string | null = null;
  try {
    if (input.valueMode === "fixed") fixedValueMinor = decimalToMinor(input.fixedValue, input.currencyMode === "fixed" ? input.fixedCurrency : app.currency).toString();
    if (input.currencyMode === "fixed") fixedCurrency = normalizeCurrency(input.fixedCurrency);
  } catch {
    redirect(postbacksUrl(input.app, input.workspace, "error=value"));
  }
  const configuration = providerConfiguration[input.provider];
  const { error } = await context.client.from("postback_destinations").upsert({
    api_version: configuration.apiVersion,
    app_id: app.id,
    connector_account_id: input.connectorAccountId,
    currency_mode: input.currencyMode,
    event_name: input.eventName,
    external_conversion_id: input.externalConversionId,
    fixed_currency: fixedCurrency,
    fixed_value_minor: fixedValueMinor,
    name: `${input.provider}:${input.eventName}`,
    organization_id: app.organizationId,
    provider: input.provider,
    provider_event_name: input.providerEventName,
    provider_mode: configuration.mode,
    send_value: input.valueMode !== "none",
    status: input.status,
    test_event_code: input.provider === "meta_ads" && input.testEventCode ? input.testEventCode : null,
    value_mode: input.valueMode,
  }, { onConflict: "app_id,provider,event_name,name" });
  if (error) redirect(postbacksUrl(input.app, input.workspace, "error=save"));
  revalidatePath("/dashboard/postbacks");
  redirect(postbacksUrl(input.app, input.workspace, "saved=1"));
}

export async function setPostbackDestinationStatusAction(destinationId: string, app: string, workspace: string, nextStatus: "active" | "paused") {
  if (!z.uuid().safeParse(destinationId).success || !["active", "paused"].includes(nextStatus)) return;
  const context = await editableContext(app, workspace);
  if (nextStatus === "active") {
    const { data: destination } = await context.client.from("postback_destinations").select("connector_account_id,external_conversion_id").eq("id", destinationId).eq("app_id", context.selectedApp!.id).maybeSingle();
    if (!destination?.connector_account_id || !destination.external_conversion_id) redirect(postbacksUrl(app, workspace, "error=credentials"));
    const { data: account } = await context.client.from("connector_accounts").select("connection_state").eq("id", destination.connector_account_id).maybeSingle();
    if (!account || !["ready", "error"].includes(account.connection_state)) redirect(postbacksUrl(app, workspace, "error=credentials"));
  }
  const { error } = await context.client.from("postback_destinations").update({ status: nextStatus }).eq("id", destinationId).eq("app_id", context.selectedApp!.id);
  if (error) redirect(postbacksUrl(app, workspace, "error=status"));
  revalidatePath("/dashboard/postbacks");
  redirect(postbacksUrl(app, workspace, "saved=1"));
}

export async function testPostbackDestinationAction(destinationId: string, app: string, workspace: string) {
  if (!z.uuid().safeParse(destinationId).success) return;
  const context = await editableContext(app, workspace);
  const { data: destination, error } = await context.client
    .from("postback_destinations")
    .select("id,provider,connector_account_id,external_conversion_id,api_version,provider_event_name,test_event_code")
    .eq("id", destinationId)
    .eq("app_id", context.selectedApp!.id)
    .single();
  if (error || !destination?.connector_account_id || !destination.external_conversion_id || !isRemoteConnectorProvider(destination.provider)) redirect(postbacksUrl(app, workspace, "error=test_config"));
  const { data: account } = await context.client.from("connector_accounts").select("id,external_account_id,login_customer_id").eq("id", destination.connector_account_id).single();
  if (!account?.external_account_id) redirect(postbacksUrl(app, workspace, "error=credentials"));
  let success = false;
  let testStatus = "failed";
  let testError = "test_failed";
  try {
    const credentials = await getFreshConnectorCredentials(destination.provider, account.id);
    const environment = providerEnvironment(destination.provider);
    if (destination.provider === "tiktok_ads") {
      await createAdvertisingConnector(destination.provider).testConnection({ accountExternalId: account.external_account_id, credentials });
    }
    const adapter = createPostbackAdapter(destination.provider as PostbackProvider);
    const result = await adapter.testConfiguration({
      accountExternalId: account.external_account_id,
      apiVersion: destination.api_version,
      credentials,
      ...(environment.developerToken ? { developerToken: environment.developerToken } : {}),
      externalConversionId: destination.external_conversion_id,
      ...(account.login_customer_id ? { loginCustomerId: account.login_customer_id } : {}),
      providerEventName: destination.provider_event_name,
      ...(destination.test_event_code ? { testEventCode: destination.test_event_code } : {}),
    }, {
      click: destination.provider === "google_ads" ? { gclid: "attruvi-test-click" } : destination.provider === "meta_ads" ? { fbclid: "attruvi-test-click" } : { ttclid: "attruvi-test-click" },
      consent: "granted",
      currency: context.selectedApp!.currency,
      eventName: "purchase",
      eventTime: new Date().toISOString(),
      providerEventId: crypto.randomUUID(),
      valueMinor: BigInt(100),
    });
    success = result.ok;
    testStatus = result.mode === "local_validation" ? "local_validation" : "succeeded";
    testError = "";
  } catch (caught) {
    testError = caught instanceof Error && "code" in caught ? String(caught.code).slice(0, 120) : "test_failed";
  }
  await context.client.from("postback_destinations").update({
    last_test_error_code: testError || null,
    last_test_status: testStatus,
    last_tested_at: new Date().toISOString(),
  }).eq("id", destination.id);
  revalidatePath("/dashboard/postbacks");
  redirect(postbacksUrl(app, workspace, success ? `tested=${testStatus}` : `error=${encodeURIComponent(testError)}`));
}

export async function replayPostbackAction(jobId: string, app: string, workspace: string) {
  if (!z.uuid().safeParse(jobId).success) return;
  await editableContext(app, workspace);
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("replay_postback_job", { requested_job_id: jobId });
  if (error) redirect(postbacksUrl(app, workspace, "error=replay"));
  revalidatePath("/dashboard/postbacks");
  redirect(postbacksUrl(app, workspace, "replayed=1"));
}
