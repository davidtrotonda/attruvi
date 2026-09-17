import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/lib/data/workspace";

const currencySymbols: Record<string, string> = {
  ARS: "ARS",
  CLP: "CLP",
  COP: "COP",
  EUR: "€",
  GBP: "£",
  MXN: "MX$",
  USD: "$",
};

function formatMinorUnits(value: string, currency: string) {
  const amount = BigInt(value);
  const sign = amount < BigInt(0) ? "−" : "";
  const absolute = amount < BigInt(0) ? -amount : amount;
  const units = absolute / BigInt(100);
  const cents = (absolute % BigInt(100)).toString().padStart(2, "0");
  const symbol = currencySymbols[currency] ?? currency;
  return `${sign}${units.toLocaleString("es-ES")},${cents} ${symbol}`;
}

function formatRatio(numerator: string, denominator: string) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  if (bottom === BigInt(0)) return "—";
  const hundredths = (top * BigInt(100)) / bottom;
  return `${hundredths / BigInt(100)},${(hundredths % BigInt(100)).toString().padStart(2, "0")}×`;
}

function formatCostPerInstall(spend: string, installs: number, currency: string) {
  if (!installs) return "—";
  return formatMinorUnits((BigInt(spend) / BigInt(installs)).toString(), currency);
}

function SourceDot({ kind }: { kind: string }) {
  return <i className={`source-dot source-dot-${kind}`} aria-hidden="true" />;
}

export default async function DashboardPage() {
  const identity = await requireVerifiedIdentity();
  const workspace = await getDashboardSnapshot(identity);
  if (!workspace.app) redirect("/onboarding");

  const { app, organization, snapshot } = workspace;
  const totals = snapshot?.totals ?? {
    buyers: 0,
    installs: 0,
    revenueMinor: "0",
    spendMinor: "0",
  };

  return (
    <main className="dashboard-page">
      <header className="protected-header dashboard-header">
        <Link className="protected-brand" href="/">
          <Image alt="" height={34} src="/attruvi-logo.png" width={34} />
          <span>Attruvi</span>
        </Link>
        <div className="dashboard-project-switcher">
          <span>Proyecto</span>
          <strong>{organization.name}</strong>
          <i aria-hidden="true">/</i>
          <span>App</span>
          <strong>{app.name}</strong>
        </div>
        <div className="protected-header-actions">
          <span>{identity.displayName}</span>
          <form action={signOutAction}>
            <button type="submit">Cerrar sesión</button>
          </form>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <nav aria-label="Panel de Attruvi">
            <Link className="active" href="/dashboard"><span>◫</span>Resumen</Link>
            <span className="dashboard-nav-disabled"><span>⑂</span>Atribución <small>Próximamente</small></span>
            <span className="dashboard-nav-disabled"><span>⌁</span>Eventos <small>Próximamente</small></span>
            <span className="dashboard-nav-disabled"><span>↗</span>Postbacks <small>Próximamente</small></span>
          </nav>
          <div className="dashboard-sidebar-help">
            <strong>Tu app ya está creada</strong>
            <p>El siguiente paso será instalar el SDK de React Native.</p>
            <span>Sin credenciales publicitarias todavía</span>
          </div>
        </aside>

        <section className="dashboard-content">
          <div className="dashboard-welcome">
            <div>
              <p className="dashboard-eyebrow">RESUMEN DE ADQUISICIÓN</p>
              <h1>Hola, {identity.displayName}.</h1>
              <p>Así convierten en valor los usuarios que llegan desde tus anuncios.</p>
            </div>
            <div className="dashboard-date-filter">
              <span>Periodo</span>
              <strong>Últimos 30 días</strong>
            </div>
          </div>

          <div className="dashboard-metrics">
            <article>
              <span>Gasto publicitario</span>
              <strong>{formatMinorUnits(totals.spendMinor, app.currency)}</strong>
              <small>Importado y manual</small>
            </article>
            <article>
              <span>Instalaciones atribuidas</span>
              <strong>{totals.installs.toLocaleString("es-ES")}</strong>
              <small>Con origen identificado</small>
            </article>
            <article>
              <span>Ingresos atribuidos</span>
              <strong>{formatMinorUnits(totals.revenueMinor, app.currency)}</strong>
              <small>{totals.buyers} compradores</small>
            </article>
            <article className="dashboard-metric-accent">
              <span>ROAS</span>
              <strong>{formatRatio(totals.revenueMinor, totals.spendMinor)}</strong>
              <small>Ingresos ÷ gasto</small>
            </article>
          </div>

          <div className="dashboard-table-card">
            <div className="dashboard-card-heading">
              <div>
                <span>RENDIMIENTO POR FUENTE</span>
                <h2>Qué canales generan usuarios de valor</h2>
              </div>
              <span className="dashboard-live"><i /> Datos del entorno actual</span>
            </div>

            {snapshot && snapshot.rows.length > 0 ? (
              <div className="dashboard-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fuente</th>
                      <th>Gasto</th>
                      <th>Instalaciones</th>
                      <th>CPI</th>
                      <th>Compradores</th>
                      <th>Ingresos</th>
                      <th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rows.map((row) => (
                      <tr key={`${row.kind}-${row.name}`}>
                        <td><SourceDot kind={row.kind} /><strong>{row.name}</strong></td>
                        <td>{formatMinorUnits(row.spendMinor, app.currency)}</td>
                        <td>{row.installs.toLocaleString("es-ES")}</td>
                        <td>{formatCostPerInstall(row.spendMinor, row.installs, app.currency)}</td>
                        <td>{row.buyers.toLocaleString("es-ES")}</td>
                        <td>{formatMinorUnits(row.revenueMinor, app.currency)}</td>
                        <td><strong>{formatRatio(row.revenueMinor, row.spendMinor)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dashboard-empty">
                <div aria-hidden="true">↗</div>
                <h3>Tu panel está listo para recibir datos</h3>
                <p>Cuando instales el SDK y entren eventos, verás aquí gasto, instalaciones, compras, ingresos y ROAS.</p>
              </div>
            )}
          </div>

          <div className="dashboard-next-step">
            <span>01</span>
            <div>
              <strong>Siguiente paso: instala el SDK</strong>
              <p>La guía usará el nombre y los identificadores que acabas de configurar.</p>
            </div>
            <button disabled type="button">Guía en preparación</button>
          </div>
        </section>
      </div>
    </main>
  );
}
