import Link from "next/link";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { dashboardHref, firstParam, parseDashboardFilters, positivePage, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { getPostbacksDashboard } from "@/lib/data/operations";
import { replayPostbackAction, savePostbackDestinationAction, setPostbackDestinationStatusAction, testPostbackDestinationAction } from "./actions";

const statusLabels: Record<string, string> = { pending: "Pendiente", processing: "Enviando", succeeded: "Enviado", retryable_failed: "Reintentará", permanently_failed: "Error definitivo", skipped: "Omitido" };
const providerLabels: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads" };
const providers = ["google_ads", "meta_ads", "tiktok_ads"] as const;
const providerDefaults = {
  google_ads: { event: "purchase", external: "ID de acción de conversión", providerEvent: "Purchase" },
  meta_ads: { event: "purchase", external: "ID de Dataset o Pixel", providerEvent: "Purchase" },
  tiktok_ads: { event: "purchase", external: "Event Source ID", providerEvent: "Purchase" },
};

function anonymizedReference(value: string | null | undefined) {
  return value ? `····${value.slice(-6)}` : "—";
}

export default async function PostbacksPage({ searchParams }: { searchParams: Promise<DashboardSearchParams & { error?: string; replayed?: string; saved?: string; tested?: string }> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const status = firstParam(params.status);
  const dashboard = await getPostbacksDashboard(identity, { ...filters, page: positivePage(params.page), status });
  const app = dashboard.selectedApp;
  if (!app) return <div className="management-empty"><span aria-hidden="true">⇄</span><h2>Primero añade una app</h2><p>Los postbacks se separan por aplicación.</p></div>;
  const canConfigure = dashboard.role === "owner" || dashboard.role === "admin";
  const base = { app: app.slug, environment: filters.environment, status, workspace: app.organizationSlug };
  const feedback = params.saved
    ? "Mapeo guardado. Los próximos eventos elegibles entrarán en la cola."
    : params.replayed
      ? "Reenvío auditado añadido a la cola con el mismo event_id para evitar duplicados."
      : params.tested === "local_validation"
        ? "Configuración validada sin enviar ningún evento."
        : params.tested
          ? "El proveedor aceptó la prueba en su modo de test."
          : null;

  return <>
    <div className="management-heading"><div><p className="dashboard-eyebrow">POSTBACKS SERVER-SIDE</p><h1>Devuelve conversiones útiles a cada red.</h1><p>Attruvi usa el clic atribuido y el consentimiento guardado para enviar compras y otras señales. Si falta una evidencia permitida, la conversión se omite con un motivo claro.</p></div><Link className="management-primary-link" href={dashboardHref("/dashboard/integrations", base)}>Conectar cuentas</Link></div>
    {feedback ? <p className="management-notice" role="status">{feedback}</p> : null}
    {params.error ? <p className="management-notice management-notice-error" role="alert">No se ha completado la operación. Código seguro: {params.error}</p> : null}

    <section className="postback-summary postback-summary-wide" aria-label="Resumen de postbacks">
      <article><span>Volumen total</span><strong>{dashboard.stats.total.toLocaleString("es-ES")}</strong><small>{dashboard.lastSentAt ? `Último envío ${formatDateTime(dashboard.lastSentAt, app.timezone)}` : "Sin envíos todavía"}</small></article>
      <article><span>Entregados</span><strong>{dashboard.stats.succeeded.toLocaleString("es-ES")}</strong><small>{dashboard.stats.success_rate.toLocaleString("es-ES")} % de éxito final</small></article>
      <article><span>En cola</span><strong>{(dashboard.stats.pending + dashboard.stats.processing).toLocaleString("es-ES")}</strong><small>Procesado fuera de la petición de la app</small></article>
      <article><span>Omitidos</span><strong>{dashboard.stats.skipped.toLocaleString("es-ES")}</strong><small>Sin consentimiento o identificador válido</small></article>
      <article><span>Errores</span><strong>{(dashboard.stats.retryable_failed + dashboard.stats.permanently_failed).toLocaleString("es-ES")}</strong><small>Reintentos y dead-letter</small></article>
      <article><span>Latencia p95</span><strong>{Math.round(dashboard.stats.p95_latency_ms).toLocaleString("es-ES")} ms</strong><small>Media {Math.round(dashboard.stats.average_latency_ms).toLocaleString("es-ES")} ms</small></article>
    </section>

    <section className="postback-config-section">
      <div className="cost-section-heading"><div><span>01</span><h2>Mapea tus eventos</h2></div><p>Un mapeo activo crea la salida automáticamente. Las credenciales siguen cifradas en servidor y nunca llegan al navegador.</p></div>
      <div className="postback-provider-grid">
        {providers.map((provider) => {
          const accounts = dashboard.connectorAccounts.filter((account) => account.provider === provider);
          const mappings = dashboard.destinations.filter((destination) => destination.provider === provider);
          const readyAccounts = accounts.filter((account) => ["ready", "error"].includes(account.connection_state));
          const defaults = providerDefaults[provider];
          return <article className="postback-provider-card" key={provider}>
            <header><div className={`connector-logo connector-logo-${provider.replace("_ads", "")}`}>{providerLabels[provider].slice(0, 1)}</div><div><h3>{providerLabels[provider]}</h3><span>API {provider === "google_ads" ? "v25" : provider === "meta_ads" ? "v26.0" : "v1.3"}</span></div><span className={`connector-state ${readyAccounts.length ? "" : "connector-state-reconnect_required"}`}>{readyAccounts.length ? "Preparado" : "Pendiente de credenciales"}</span></header>
            {mappings.length ? <div className="postback-mapping-list">{mappings.map((mapping) => {
              const toggle = setPostbackDestinationStatusAction.bind(null, mapping.id, app.slug, app.organizationSlug, mapping.status === "active" ? "paused" : "active");
              const test = testPostbackDestinationAction.bind(null, mapping.id, app.slug, app.organizationSlug);
              return <div key={mapping.id}><div><strong>{mapping.event_name} → {mapping.provider_event_name}</strong><span>{mapping.value_mode === "none" ? "Sin valor" : mapping.value_mode === "fixed" ? "Valor fijo" : "Valor del evento"} · {mapping.status === "active" ? "Activo" : "Pausado"}</span><small>{mapping.last_tested_at ? `Prueba: ${mapping.last_test_status === "failed" ? mapping.last_test_error_code : mapping.last_test_status}` : "Sin probar"}</small></div>{canConfigure ? <div><form action={test}><button type="submit">Probar</button></form><form action={toggle}><button type="submit">{mapping.status === "active" ? "Pausar" : "Activar"}</button></form></div> : null}</div>;
            })}</div> : <p className="connector-empty-copy">Aún no hay eventos mapeados para {providerLabels[provider]}.</p>}
            {canConfigure ? <details className="postback-mapping-builder" open={mappings.length === 0}><summary>{mappings.length ? "Añadir o actualizar mapeo" : "Configurar primer mapeo"}</summary><form action={savePostbackDestinationAction}>
              <input name="app" type="hidden" value={app.slug} /><input name="workspace" type="hidden" value={app.organizationSlug} /><input name="provider" type="hidden" value={provider} />
              <label><span>Cuenta conectada</span><select name="connector_account_id" required><option value="">Elige una cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.account_name || providerLabels[provider]} · {account.external_account_hint || "ID oculto"}</option>)}</select></label>
              <label><span>Evento de Attruvi</span><select defaultValue={defaults.event} name="event_name"><option value="sign_up">Registro</option><option value="purchase">Compra</option><option value="subscription_started">Inicio de suscripción</option><option value="subscription_renewed">Renovación</option></select></label>
              <label><span>Nombre en {providerLabels[provider]}</span><input defaultValue={defaults.providerEvent} name="provider_event_name" required /></label>
              <label><span>{defaults.external}</span><input name="external_conversion_id" required /></label>
              <label><span>Valor</span><select defaultValue="event" name="value_mode"><option value="event">Usar valor del evento</option><option value="fixed">Usar valor fijo</option><option value="none">No enviar valor</option></select></label>
              <label><span>Moneda</span><select defaultValue="event" name="currency_mode"><option value="event">Usar moneda del evento</option><option value="app">Usar {app.currency}</option><option value="fixed">Elegir moneda fija</option></select></label>
              <label><span>Valor fijo, si lo elegiste</span><input inputMode="decimal" name="fixed_value" placeholder="9.99" /></label>
              <label><span>Moneda fija</span><input defaultValue={app.currency} maxLength={3} name="fixed_currency" /></label>
              {provider === "meta_ads" ? <label className="field-span-two"><span>Test Event Code de Meta</span><input name="test_event_code" placeholder="Solo para probar; no es un token de acceso" /></label> : null}
              <label><span>Estado inicial</span><select defaultValue={readyAccounts.length ? "active" : "paused"} name="status"><option value="active">Activo</option><option value="paused">Pausado</option></select></label>
              <button disabled={!accounts.length} type="submit">Guardar mapeo</button>
            </form><p>{provider === "google_ads" ? "Probar usa validate_only: Google valida y no guarda la conversión." : provider === "meta_ads" ? "Probar envía exclusivamente a Test Events usando tu código de prueba." : "Probar valida el acceso y el payload, pero no envía una conversión porque TikTok no ofrece un modo universal sin entrega."}</p></details> : <p className="postback-readonly">Tu rol puede consultar los envíos, pero no cambiar mapeos.</p>}
          </article>;
        })}
      </div>
    </section>

    {dashboard.errors.length ? <section className="postback-error-codes"><div className="cost-section-heading"><div><span>02</span><h2>Errores por código</h2></div><p>Solo se guardan códigos y extractos redactados; nunca tokens ni payloads completos.</p></div><div>{dashboard.errors.map((error) => <article key={error.code}><code>{error.code}</code><strong>{Number(error.count).toLocaleString("es-ES")}</strong></article>)}</div></section> : null}

    <section className="postback-history-section">
      <div className="cost-section-heading"><div><span>{dashboard.errors.length ? "03" : "02"}</span><h2>Historial de entrega</h2></div><p>Detalle anonimizado, estados recuperables y reenvío manual auditado.</p></div>
      <form className="campaign-filters postback-filters" method="get"><input name="app" type="hidden" value={app.slug} /><input name="workspace" type="hidden" value={app.organizationSlug} /><input name="environment" type="hidden" value={filters.environment} /><label><span>Estado</span><select defaultValue={status ?? ""} name="status"><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit">Aplicar</button><span>{dashboard.total.toLocaleString("es-ES")} trabajos</span></form>
      <section className="dashboard-table-card">{dashboard.jobs.length ? <div className="dashboard-table-scroll"><table><thead><tr><th>Red / mapeo</th><th>Estado</th><th>Intentos</th><th>Latencia</th><th>Creado</th><th>Referencia</th><th>Resultado seguro</th><th /></tr></thead><tbody>{dashboard.jobs.map((job) => {
        const replay = replayPostbackAction.bind(null, job.id, app.slug, app.organizationSlug);
        const replayable = ["retryable_failed", "permanently_failed", "skipped"].includes(job.status);
        return <tr key={job.id}><td><span><strong>{providerLabels[job.destination?.provider ?? ""] ?? "Destino"}</strong><small>{job.destination?.event_name ?? "—"} → {job.destination?.provider_event_name ?? "—"}</small></span></td><td><span className={`job-status job-status-${job.status}`}>{statusLabels[job.status] ?? job.status}</span></td><td>{job.attempt_count}/{job.max_attempts}</td><td>{job.latency_ms === null ? "—" : `${job.latency_ms} ms`}</td><td>{formatDateTime(job.created_at, app.timezone)}</td><td><code>{anonymizedReference(job.provider_request_id)}</code></td><td><span><strong>{job.last_error_code ?? (job.status === "succeeded" ? "Aceptado" : "—")}</strong><small>{job.skip_reason ? `Omitido: ${job.skip_reason}` : job.last_http_status ? `HTTP ${job.last_http_status}` : "Sin datos sensibles"}</small></span></td><td>{canConfigure && replayable ? <form action={replay}><button className="postback-replay" type="submit">Reenviar</button></form> : null}</td></tr>;
      })}</tbody></table></div> : <div className="dashboard-empty"><h3>Aún no hay postbacks</h3><p>Cuando llegue un evento que coincida con un mapeo activo aparecerá aquí. No se muestran métricas inventadas.</p></div>}
        {dashboard.pageCount > 1 ? <nav aria-label="Páginas de postbacks" className="user-pagination">{dashboard.page > 1 ? <Link href={dashboardHref("/dashboard/postbacks", { ...base, page: dashboard.page - 1 })}>← Anterior</Link> : <span />}<strong>Página {dashboard.page} de {dashboard.pageCount}</strong>{dashboard.page < dashboard.pageCount ? <Link href={dashboardHref("/dashboard/postbacks", { ...base, page: dashboard.page + 1 })}>Siguiente →</Link> : <span />}</nav> : null}
      </section>
    </section>
  </>;
}
