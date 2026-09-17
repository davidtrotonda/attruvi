import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { formatDecimalMoney, formatMoneyMinor, formatPercent, formatRatio, periodChange } from "@/lib/dashboard/format";
import { dashboardHref, parseDashboardFilters, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { getDashboardOverview } from "@/lib/data/dashboard";
import type { MetricRollupRow } from "@/lib/metrics/query";

function number(value: number | string | null) { return value === null ? 0 : Number(value); }

function Change({ current, inverse = false, previous }: { current: number; inverse?: boolean; previous: number }) {
  const change = periodChange(current, previous);
  if (change === null) return <small className="metric-change metric-change-neutral">Nuevo en este periodo</small>;
  const improved = inverse ? change <= 0 : change >= 0;
  return <small className={`metric-change ${improved ? "metric-change-good" : "metric-change-bad"}`}>
    {change >= 0 ? "↑" : "↓"} {Math.abs(change * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })}% vs. periodo anterior
  </small>;
}

function MetricCard({ current, inverse, label, previous, value }: { current: number; inverse?: boolean; label: string; previous: number; value: string }) {
  return <article><span>{label}</span><strong>{value}</strong><Change current={current} inverse={inverse} previous={previous} /></article>;
}

function TrendChart({ rows, currency }: { rows: MetricRollupRow[]; currency: string }) {
  const ordered = rows.filter((row) => row.metric_date).toSorted((left, right) => (left.metric_date ?? "").localeCompare(right.metric_date ?? ""));
  if (ordered.length === 0) return <div className="dashboard-chart-empty"><span aria-hidden="true">⌁</span><p>El gráfico aparecerá cuando llegue la primera instalación o gasto.</p></div>;
  const values = ordered.flatMap((row) => [number(row.spend_minor), number(row.revenue_minor)]);
  const max = Math.max(...values, 1);
  const point = (value: number, index: number) => {
    const x = ordered.length === 1 ? 400 : 30 + (index / (ordered.length - 1)) * 740;
    const y = 210 - (value / max) * 175;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const spend = ordered.map((row, index) => point(number(row.spend_minor), index)).join(" ");
  const revenue = ordered.map((row, index) => point(number(row.revenue_minor), index)).join(" ");
  return <div className="dashboard-chart-wrap">
    <svg aria-label={`Evolución diaria de gasto e ingresos en ${currency}`} className="dashboard-chart" role="img" viewBox="0 0 800 240">
      {[35, 80, 125, 170, 215].map((y) => <line key={y} x1="30" x2="770" y1={y} y2={y} />)}
      <polyline className="chart-line-spend" fill="none" points={spend} /><polyline className="chart-line-revenue" fill="none" points={revenue} />
      {ordered.map((row, index) => { const [x, y] = point(number(row.revenue_minor), index).split(","); return <circle className="chart-point" cx={x} cy={y} key={row.metric_date} r="3"><title>{`${row.metric_date}: ${formatMoneyMinor(row.revenue_minor, currency)}`}</title></circle>; })}
    </svg>
    <div className="chart-legend"><span><i className="legend-revenue" />Ingresos</span><span><i className="legend-spend" />Gasto</span><small>{ordered[0]?.metric_date} — {ordered.at(-1)?.metric_date}</small></div>
  </div>;
}

function DataStatus({ status }: { status: "complete" | "partial" | "syncing" | "without_costs" }) {
  const labels = { complete: "Datos completos", partial: "Datos parciales", syncing: "Sincronizando", without_costs: "Sin costes" };
  return <span className={`data-status data-status-${status}`}><i />{labels[status]}</span>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const overview = await getDashboardOverview(identity, filters);
  if (!overview.selectedApp) redirect("/onboarding");
  const app = overview.selectedApp;
  const current = overview.current;
  const previous = overview.previous;
  const hasData = number(current.installs) > 0 || number(current.spend_minor) > 0 || number(current.revenue_minor) !== 0;

  return <>
    <div className="dashboard-welcome dashboard-welcome-compact">
      <div><p className="dashboard-eyebrow">RESUMEN · {app.name.toUpperCase()}</p><h1>Decide dónde invertir.</h1><p>Compara lo que gastas con los usuarios, compradores e ingresos que consigue cada anuncio.</p></div>
      <form className="dashboard-date-filter" method="get">
        <input name="app" type="hidden" value={app.slug} /><input name="workspace" type="hidden" value={app.organizationSlug} /><input name="environment" type="hidden" value={filters.environment} />
        <label><span>Desde</span><input name="from" type="date" defaultValue={filters.from} /></label><label><span>Hasta</span><input name="to" type="date" defaultValue={filters.to} /></label>
        <label><span>Plataforma</span><select name="platform" defaultValue={filters.platform ?? ""}><option value="">Todas</option><option value="android">Android</option><option value="ios">iOS</option></select></label><button type="submit">Aplicar</button>
      </form>
    </div>

    {overview.health ? <div className="dashboard-health-row"><DataStatus status={overview.health.status} /><span>Zona horaria: {app.timezone}</span>{overview.health.pendingCredentials ? <Link href={dashboardHref("/dashboard/integrations", { app: app.slug, environment: filters.environment, workspace: app.organizationSlug })}>Completar integraciones</Link> : null}</div> : null}

    {!hasData ? <section className="dashboard-onboarding-empty">
      <div><span>TU PANEL ESTÁ LISTO</span><h2>Empieza a medir sin datos inventados.</h2><p>Conecta la app, crea un enlace y registra una instalación. En cuanto lleguen eventos reales, este resumen se completará automáticamente.</p></div>
      <ol><li><strong>1</strong><span>Instala el SDK React Native</span></li><li><strong>2</strong><span>Crea tu primer enlace</span></li><li><strong>3</strong><span>Conecta el gasto publicitario</span></li></ol>
      <div><Link href={dashboardHref("/dashboard/settings", { app: app.slug, environment: filters.environment, workspace: app.organizationSlug })}>Configurar app</Link><Link href={dashboardHref("/dashboard/links", { app: app.slug, environment: filters.environment, workspace: app.organizationSlug })}>Crear enlace</Link></div>
    </section> : <>
      <section aria-label="Métricas principales" className="dashboard-metrics dashboard-metrics-nine">
        <MetricCard current={number(current.spend_minor)} label="Gasto" previous={number(previous.spend_minor)} value={formatMoneyMinor(current.spend_minor, app.currency)} />
        <MetricCard current={current.installs} label="Instalaciones" previous={previous.installs} value={current.installs.toLocaleString("es-ES")} />
        <MetricCard current={number(current.cpi_minor)} inverse label="CPI" previous={number(previous.cpi_minor)} value={formatDecimalMoney(current.cpi_minor, app.currency)} />
        <MetricCard current={current.buyers} label="Compradores" previous={previous.buyers} value={current.buyers.toLocaleString("es-ES")} />
        <MetricCard current={number(current.cac_minor)} inverse label="CAC" previous={number(previous.cac_minor)} value={formatDecimalMoney(current.cac_minor, app.currency)} />
        <MetricCard current={number(current.revenue_minor)} label="Ingresos" previous={number(previous.revenue_minor)} value={formatMoneyMinor(current.revenue_minor, app.currency)} />
        <MetricCard current={number(current.roas)} label="ROAS" previous={number(previous.roas)} value={formatRatio(current.roas)} />
        <MetricCard current={number(current.retention_d7)} label="Retención D7" previous={number(previous.retention_d7)} value={formatPercent(current.retention_d7)} />
        <MetricCard current={number(current.observed_ltv_lifetime_minor)} label="LTV observado" previous={number(previous.observed_ltv_lifetime_minor)} value={formatDecimalMoney(current.observed_ltv_lifetime_minor, app.currency)} />
      </section>
      <section className="dashboard-chart-card"><div className="dashboard-card-heading"><div><span>EVOLUCIÓN DIARIA</span><h2>Ingresos frente a gasto</h2></div><DataStatus status={overview.health?.status ?? "complete"} /></div><TrendChart currency={app.currency} rows={overview.trend} /></section>
      <section className="dashboard-table-card">
        <div className="dashboard-card-heading"><div><span>VALOR POR ANUNCIO</span><h2>Qué anuncios generan valor</h2></div><Link href={dashboardHref("/dashboard/campaigns", { app: app.slug, environment: filters.environment, from: filters.from, level: "ad", platform: filters.platform, to: filters.to, workspace: app.organizationSlug })}>Ver todos</Link></div>
        {overview.topAds.length ? <div className="dashboard-table-scroll"><table><thead><tr><th>Anuncio</th><th>Gasto</th><th>Instalaciones</th><th>Compradores</th><th>CAC</th><th>Ingresos</th><th>ROAS</th><th>LTV</th></tr></thead><tbody>
          {overview.topAds.map((row, index) => <tr key={`${row.ad_name}-${index}`}><td><span><strong>{row.ad_name ?? "Sin nombre"}</strong><small>{[row.source_name, row.campaign_name, row.ad_group_name].filter(Boolean).join(" → ")}</small></span></td><td>{formatMoneyMinor(row.spend_minor, app.currency)}</td><td>{row.installs.toLocaleString("es-ES")}</td><td>{row.buyers.toLocaleString("es-ES")}</td><td>{formatDecimalMoney(row.cac_minor, app.currency)}</td><td>{formatMoneyMinor(row.revenue_minor, app.currency)}</td><td><strong>{formatRatio(row.roas)}</strong></td><td>{formatDecimalMoney(row.observed_ltv_lifetime_minor, app.currency)}</td></tr>)}
        </tbody></table></div> : <div className="dashboard-empty"><h3>Aún no hay anuncios con resultados</h3><p>Los anuncios aparecerán al relacionar coste o conversiones con su jerarquía publicitaria.</p></div>}
      </section>
    </>}
  </>;
}
