import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/lib/data/workspace";

const currencySymbols: Record<string, string> = {
  ARS: "ARS", CLP: "CLP", COP: "COP", EUR: "€", GBP: "£", MXN: "MX$", USD: "$",
};

function formatMinorUnits(value: string, currency: string) {
  const amount = BigInt(value);
  const sign = amount < BigInt(0) ? "−" : "";
  const absolute = amount < BigInt(0) ? -amount : amount;
  const units = absolute / BigInt(100);
  const cents = (absolute % BigInt(100)).toString().padStart(2, "0");
  return `${sign}${units.toLocaleString("es-ES")},${cents} ${currencySymbols[currency] ?? currency}`;
}

function formatDecimalMoney(value: string | null, currency: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value) / 100);
}

function formatDecimalRatio(value: string | null) {
  if (value === null) return "—";
  return `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 })}×`;
}

function formatPercent(value: string | null) {
  if (value === null) return "—";
  return `${(Number(value) * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
}

function dateInput(value: string | string[] | undefined, fallback: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

function SourceDot({ kind }: { kind: string }) {
  return <i className={`source-dot source-dot-${kind}`} aria-hidden="true" />;
}

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(new Date().getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const environmentValue = Array.isArray(params.environment) ? params.environment[0] : params.environment;
  const platformValue = Array.isArray(params.platform) ? params.platform[0] : params.platform;
  const environment = environmentValue === "development" || environmentValue === "staging"
    ? environmentValue
    : "production";
  const platform = platformValue === "android" || platformValue === "ios" ? platformValue : undefined;
  const from = dateInput(params.from, thirtyDaysAgo);
  const to = dateInput(params.to, today);
  const workspace = await getDashboardSnapshot(identity, {
    environment,
    from: from <= to ? from : to,
    ...(platform ? { platform } : {}),
    to: from <= to ? to : from,
  });
  if (!workspace.app) redirect("/onboarding");

  const { app, organization, snapshot } = workspace;
  const totals = snapshot?.totals ?? {
    buyers: 0,
    clicks: 0,
    installs: 0,
    registeredUsers: 0,
    retentionD7: null,
    revenueMinor: "0",
    roas: null,
    spendMinor: "0",
  };

  return (
    <DashboardShell active="summary" appName={app.name} displayName={identity.displayName} organizationName={organization.name}>
      <div className="dashboard-welcome">
        <div>
          <p className="dashboard-eyebrow">RESUMEN DE ADQUISICIÓN</p>
          <h1>Hola, {identity.displayName}.</h1>
          <p>Así convierten en valor los usuarios que llegan desde tus anuncios.</p>
        </div>
        <form className="dashboard-date-filter" method="get">
          <label><span>Desde</span><input name="from" type="date" defaultValue={from} /></label>
          <label><span>Hasta</span><input name="to" type="date" defaultValue={to} /></label>
          <label><span>Entorno</span><select name="environment" defaultValue={environment}><option value="production">Producción</option><option value="staging">Staging</option><option value="development">Desarrollo</option></select></label>
          <label><span>Plataforma</span><select name="platform" defaultValue={platform ?? ""}><option value="">Todas</option><option value="android">Android</option><option value="ios">iOS</option></select></label>
          <button type="submit">Aplicar</button>
        </form>
      </div>

      <div className="dashboard-metrics">
        <article><span>Gasto publicitario</span><strong>{formatMinorUnits(totals.spendMinor, app.currency)}</strong><small>Importado y manual</small></article>
        <article><span>Instalaciones atribuidas</span><strong>{totals.installs.toLocaleString("es-ES")}</strong><small>Con origen identificado</small></article>
        <article><span>Ingresos atribuidos</span><strong>{formatMinorUnits(totals.revenueMinor, app.currency)}</strong><small>{totals.buyers} compradores</small></article>
        <article className="dashboard-metric-accent"><span>ROAS</span><strong>{formatDecimalRatio(totals.roas)}</strong><small>Ingresos ÷ gasto</small></article>
      </div>

      <div className="dashboard-table-card">
        <div className="dashboard-card-heading">
          <div><span>RENDIMIENTO POR FUENTE</span><h2>Qué canales generan usuarios de valor</h2></div>
          <span className="dashboard-live"><i /> Datos del entorno actual</span>
        </div>
        {snapshot && snapshot.rows.length > 0 ? (
          <div className="dashboard-table-scroll">
            <table>
              <thead><tr><th>Fuente</th><th>Gasto</th><th>Clics</th><th>Instalaciones</th><th>CPI</th><th>Compradores</th><th>CAC</th><th>Ingresos</th><th>ROAS</th><th>Retención D7</th></tr></thead>
              <tbody>
                {snapshot.rows.map((row) => (
                  <tr key={row.sourceId ?? `${row.kind}-${row.name}`}>
                    <td><SourceDot kind={row.kind} /><strong>{row.name}</strong></td>
                    <td>{formatMinorUnits(row.spendMinor, app.currency)}</td>
                    <td>{row.clicks.toLocaleString("es-ES")}</td>
                    <td>{row.installs.toLocaleString("es-ES")}</td>
                    <td>{formatDecimalMoney(row.cpiMinor, app.currency)}</td>
                    <td>{row.buyers.toLocaleString("es-ES")}</td>
                    <td>{formatDecimalMoney(row.cacMinor, app.currency)}</td>
                    <td>{formatMinorUnits(row.revenueMinor, app.currency)}</td>
                    <td><strong>{formatDecimalRatio(row.roas)}</strong></td>
                    <td>{formatPercent(row.retentionD7)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dashboard-empty"><div aria-hidden="true">↗</div><h3>Tu panel está listo para recibir datos</h3><p>Cuando instales el SDK y entren eventos, verás aquí gasto, instalaciones, compras, ingresos y ROAS.</p></div>
        )}
      </div>

      <div className="dashboard-next-step">
        <span>01</span><div><strong>Siguiente paso: crea un enlace</strong><p>Conecta un anuncio con la tienda o la ruta exacta de tu app.</p></div>
        <Link href="/dashboard/links">Crear enlace</Link>
      </div>
    </DashboardShell>
  );
}
