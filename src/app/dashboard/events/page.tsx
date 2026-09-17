import Link from "next/link";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { formatDateTime, formatMoneyMinor, shortOpaqueId } from "@/lib/dashboard/format";
import { dashboardHref, firstParam, parseDashboardFilters, positivePage, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { getEventsDashboard } from "@/lib/data/operations";

const eventLabels: Record<string, string> = { app_open: "Apertura", install: "Instalación", purchase: "Compra", session_start: "Sesión", sign_up: "Registro", subscription_cancelled: "Suscripción cancelada", subscription_renewed: "Renovación", subscription_started: "Suscripción iniciada" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const event = firstParam(params.event);
  const dashboard = await getEventsDashboard(identity, { ...filters, event, page: positivePage(params.page) });
  const app = dashboard.selectedApp;
  if (!app) return <div className="management-empty"><span aria-hidden="true">◇</span><h2>Primero añade una app</h2><p>Los eventos se separan por aplicación.</p><Link className="management-primary-link" href="/onboarding">Configurar app</Link></div>;
  const base = { app: app.slug, environment: filters.environment, event, from: filters.from, to: filters.to, workspace: app.organizationSlug };
  return <>
    <div className="management-heading"><div><p className="dashboard-eyebrow">EVENTOS</p><h1>Actividad que llega del SDK.</h1><p>Consulta aperturas, sesiones, registros, compras y suscripciones sin descargar el histórico completo al navegador.</p></div></div>
    <form className="campaign-filters" method="get"><input name="app" type="hidden" value={app.slug} /><input name="workspace" type="hidden" value={app.organizationSlug} /><input name="environment" type="hidden" value={filters.environment} /><label><span>Desde</span><input defaultValue={filters.from} name="from" type="date" /></label><label><span>Hasta</span><input defaultValue={filters.to} name="to" type="date" /></label><label><span>Evento</span><select defaultValue={event ?? ""} name="event"><option value="">Todos</option>{dashboard.eventNames.map((name) => <option key={name} value={name}>{eventLabels[name] ?? name}</option>)}</select></label><button type="submit">Aplicar</button><span>{dashboard.total.toLocaleString("es-ES")} eventos</span></form>
    <section className="dashboard-table-card"><div className="dashboard-card-heading"><div><span>RECEPCIÓN DEL SDK</span><h2>Eventos procesados</h2></div><span className="dashboard-live"><i /> Datos reales</span></div>
      {dashboard.events.length ? <div className="dashboard-table-scroll"><table><thead><tr><th>Evento</th><th>Hora de la app</th><th>Recibido</th><th>Instalación</th><th>Origen</th><th>Valor</th></tr></thead><tbody>{dashboard.events.map((row) => <tr key={row.id}><td><strong>{eventLabels[row.name] ?? row.name}</strong></td><td>{formatDateTime(row.occurred_at, app.timezone)}</td><td>{formatDateTime(row.received_at, app.timezone)}</td><td><code>{shortOpaqueId(row.installation_id)}</code></td><td><span><strong>{row.attribution_source_name ?? "Sin atribución"}</strong><small>{row.attribution_campaign_name ?? "—"}</small></span></td><td>{row.value_minor === null ? "—" : formatMoneyMinor(row.value_minor, row.currency ?? app.currency)}</td></tr>)}</tbody></table></div> : <div className="dashboard-empty"><h3>No hay eventos con esos filtros</h3><p>Cuando el SDK envíe actividad válida aparecerá aquí. Revisa la integración si ya esperabas tráfico.</p></div>}
      {dashboard.pageCount > 1 ? <nav aria-label="Páginas de eventos" className="user-pagination">{dashboard.page > 1 ? <Link href={dashboardHref("/dashboard/events", { ...base, page: dashboard.page - 1 })}>← Anterior</Link> : <span />}<strong>Página {dashboard.page} de {dashboard.pageCount}</strong>{dashboard.page < dashboard.pageCount ? <Link href={dashboardHref("/dashboard/events", { ...base, page: dashboard.page + 1 })}>Siguiente →</Link> : <span />}</nav> : null}
    </section>
  </>;
}
