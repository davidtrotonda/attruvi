import Link from "next/link";
import { CampaignTable } from "@/components/dashboard/campaign-table";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { dashboardHref, firstParam, metricLevel, parseDashboardFilters, positivePage, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { getCampaignDashboard } from "@/lib/data/dashboard";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const parsed = parseDashboardFilters(params);
  const level = metricLevel(params.level);
  const page = positivePage(params.page);
  const dashboard = await getCampaignDashboard(identity, {
    ...parsed,
    direction: firstParam(params.direction),
    level,
    page,
    sort: firstParam(params.sort),
  });
  const app = dashboard.selectedApp;
  if (!app) return <div className="management-empty"><span aria-hidden="true">▣</span><h2>Primero añade una app</h2><p>Las campañas aparecerán cuando exista una aplicación.</p><Link className="management-primary-link" href="/onboarding">Configurar app</Link></div>;
  const base = { app: app.slug, environment: parsed.environment, from: parsed.from, level, platform: parsed.platform, source: parsed.source, to: parsed.to, workspace: app.organizationSlug };
  const sortLinks = Object.fromEntries(["name", "spend_minor", "installs", "cpi_minor", "buyers", "cac_minor", "revenue_minor", "roas", "retention_d7", "observed_ltv_lifetime_minor"].map((sort) => [sort, dashboardHref("/dashboard/campaigns", { ...base, direction: dashboard.sort === sort && dashboard.direction === "desc" ? "asc" : "desc", sort })]));

  return <>
    <div className="management-heading campaign-heading"><div><p className="dashboard-eyebrow">CAMPAÑAS</p><h1>Compara cada nivel.</h1><p>Baja desde campaña hasta anuncio para encontrar qué inversión trae compradores, retención e ingresos reales.</p></div></div>
    <form className="campaign-filters" method="get">
      <input name="app" type="hidden" value={app.slug} /><input name="workspace" type="hidden" value={app.organizationSlug} /><input name="environment" type="hidden" value={parsed.environment} /><input name="level" type="hidden" value={level} />
      <label><span>Desde</span><input defaultValue={parsed.from} name="from" type="date" /></label><label><span>Hasta</span><input defaultValue={parsed.to} name="to" type="date" /></label>
      <label><span>Plataforma</span><select defaultValue={parsed.platform ?? ""} name="platform"><option value="">Todas</option><option value="ios">iOS</option><option value="android">Android</option></select></label>
      <label><span>Fuente</span><select defaultValue={parsed.source ?? ""} name="source"><option value="">Todas</option>{dashboard.sources.map((source) => <option key={source.kind} value={source.kind}>{source.name}</option>)}</select></label><button type="submit">Aplicar</button>
    </form>
    <div className="campaign-toolbar"><nav aria-label="Jerarquía publicitaria">{(["campaign", "ad_group", "ad"] as const).map((item) => <Link className={level === item ? "active" : undefined} href={dashboardHref("/dashboard/campaigns", { ...base, level: item })} key={item}>{item === "campaign" ? "Campañas" : item === "ad_group" ? "Grupos" : "Anuncios"}</Link>)}</nav><span>{dashboard.total.toLocaleString("es-ES")} resultados · página {dashboard.page} de {Math.max(dashboard.pageCount, 1)}</span></div>
    <section className="dashboard-table-card campaign-table-card">
      <div className="dashboard-card-heading"><div><span>{level === "campaign" ? "CAMPAÑA" : level === "ad_group" ? "GRUPO DE ANUNCIOS" : "ANUNCIO"}</span><h2>Rendimiento y valor generado</h2></div><span className={`data-status data-status-${dashboard.health?.status ?? "complete"}`}><i />{dashboard.health?.status === "syncing" ? "Sincronizando" : dashboard.health?.status === "partial" ? "Datos parciales" : dashboard.health?.status === "without_costs" ? "Sin costes" : "Datos completos"}</span></div>
      {dashboard.rows.length ? <CampaignTable currency={app.currency} rows={dashboard.rows} sortLinks={sortLinks} status={dashboard.health?.status ?? "complete"} /> : <div className="dashboard-empty"><h3>No hay datos para estos filtros</h3><p>Prueba otro periodo o conecta el gasto publicitario. No mostramos resultados ficticios.</p></div>}
      {dashboard.pageCount > 1 ? <nav aria-label="Páginas de campañas" className="user-pagination">{dashboard.page > 1 ? <Link href={dashboardHref("/dashboard/campaigns", { ...base, direction: dashboard.direction, page: dashboard.page - 1, sort: dashboard.sort })}>← Anterior</Link> : <span />}<strong>Página {dashboard.page} de {dashboard.pageCount}</strong>{dashboard.page < dashboard.pageCount ? <Link href={dashboardHref("/dashboard/campaigns", { ...base, direction: dashboard.direction, page: dashboard.page + 1, sort: dashboard.sort })}>Siguiente →</Link> : <span />}</nav> : null}
    </section>
  </>;
}
