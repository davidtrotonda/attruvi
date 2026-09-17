import Link from "next/link";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { dashboardHref, firstParam, parseDashboardFilters, positivePage, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { getPostbacksDashboard } from "@/lib/data/operations";

const statusLabels: Record<string, string> = { pending: "Pendiente", processing: "Enviando", succeeded: "Enviado", retryable_failed: "Reintentará", permanently_failed: "Error definitivo", skipped: "Omitido" };
const providerLabels: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads" };

export default async function PostbacksPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const status = firstParam(params.status);
  const dashboard = await getPostbacksDashboard(identity, { ...filters, page: positivePage(params.page), status });
  const app = dashboard.selectedApp;
  if (!app) return <div className="management-empty"><span aria-hidden="true">⇄</span><h2>Primero añade una app</h2><p>Los postbacks se separan por aplicación.</p></div>;
  const base = { app: app.slug, environment: filters.environment, status, workspace: app.organizationSlug };
  return <>
    <div className="management-heading"><div><p className="dashboard-eyebrow">POSTBACKS</p><h1>Conversiones devueltas a cada red.</h1><p>Comprueba qué señales se enviaron, cuáles reintentarán y qué credencial necesita atención.</p></div><Link className="management-primary-link" href={dashboardHref("/dashboard/integrations", base)}>Configurar destinos</Link></div>
    <section className="postback-summary"><article><span>Enviados</span><strong>{(dashboard.stats.succeeded ?? 0).toLocaleString("es-ES")}</strong></article><article><span>En cola</span><strong>{((dashboard.stats.pending ?? 0) + (dashboard.stats.processing ?? 0)).toLocaleString("es-ES")}</strong></article><article><span>Reintentará</span><strong>{(dashboard.stats.retryable_failed ?? 0).toLocaleString("es-ES")}</strong></article><article><span>Error definitivo</span><strong>{(dashboard.stats.permanently_failed ?? 0).toLocaleString("es-ES")}</strong></article></section>
    <form className="campaign-filters postback-filters" method="get"><input name="app" type="hidden" value={app.slug} /><input name="workspace" type="hidden" value={app.organizationSlug} /><input name="environment" type="hidden" value={filters.environment} /><label><span>Estado</span><select defaultValue={status ?? ""} name="status"><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit">Aplicar</button><span>{dashboard.total.toLocaleString("es-ES")} envíos</span></form>
    {dashboard.destinations.length === 0 ? <div className="permission-banner permission-banner-warning"><span aria-hidden="true">!</span><div><strong>No hay destinos configurados</strong><p>Conecta Google, Meta o TikTok y configura el identificador de conversión. Los eventos seguirán procesándose mientras tanto.</p></div></div> : null}
    <section className="dashboard-table-card"><div className="dashboard-card-heading"><div><span>HISTORIAL DE ENTREGA</span><h2>Estado de cada conversión</h2></div></div>{dashboard.jobs.length ? <div className="dashboard-table-scroll"><table><thead><tr><th>Destino</th><th>Conversión</th><th>Estado</th><th>Intentos</th><th>Creado</th><th>Completado</th><th>Error seguro</th></tr></thead><tbody>{dashboard.jobs.map((job) => <tr key={job.id}><td><strong>{providerLabels[job.destination?.provider ?? ""] ?? "Destino"}</strong></td><td><span><strong>{job.destination?.name ?? "Conversión"}</strong><small>{job.destination?.event_name ?? "—"}</small></span></td><td><span className={`job-status job-status-${job.status}`}>{statusLabels[job.status] ?? job.status}</span></td><td>{job.attempt_count}</td><td>{formatDateTime(job.created_at, app.timezone)}</td><td>{formatDateTime(job.completed_at, app.timezone)}</td><td>{job.last_error_code ?? "—"}</td></tr>)}</tbody></table></div> : <div className="dashboard-empty"><h3>Aún no hay postbacks</h3><p>Cuando un evento configurado se convierta en señal publicitaria aparecerá aquí.</p></div>}
      {dashboard.pageCount > 1 ? <nav aria-label="Páginas de postbacks" className="user-pagination">{dashboard.page > 1 ? <Link href={dashboardHref("/dashboard/postbacks", { ...base, page: dashboard.page - 1 })}>← Anterior</Link> : <span />}<strong>Página {dashboard.page} de {dashboard.pageCount}</strong>{dashboard.page < dashboard.pageCount ? <Link href={dashboardHref("/dashboard/postbacks", { ...base, page: dashboard.page + 1 })}>Siguiente →</Link> : <span />}</nav> : null}
    </section>
  </>;
}
