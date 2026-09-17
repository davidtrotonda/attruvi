import Link from "next/link";
import { currencyExponent } from "@attruvi/connectors";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getAdvertisingCosts } from "@/lib/data/costs";
import { addManualCostsAction, assignCostCampaignAction, enqueueCostSyncAction } from "./actions";

function formatMoney(value: bigint, currency: string) {
  const exponent = currencyExponent(currency);
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const base = BigInt(10) ** BigInt(exponent);
  const whole = (absolute / base).toLocaleString("es-ES");
  const fraction = exponent ? `,${(absolute % base).toString().padStart(exponent, "0")}` : "";
  return `${negative ? "−" : ""}${whole}${fraction} ${currency}`;
}

const providerClass: Record<string, string> = { google_ads: "google", manual: "manual", meta_ads: "meta", tiktok_ads: "tiktok" };
const statusLabel: Record<string, string> = {
  disabled: "Desactivada",
  error: "Necesita atención",
  pending_credentials: "Falta configurar",
  ready: "Conectada",
  reconnect_required: "Vuelve a conectar",
  syncing: "Sincronizando",
};

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; assigned?: string; connected?: string; environment?: string; error?: string; manual?: string; setup?: string; sync?: string; workspace?: string }>;
}) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const management = await getAdvertisingCosts(identity, params.app, params.workspace);
  const canConfigure = management.role === "owner" || management.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const message = params.connected
    ? "Cuenta publicitaria conectada. La primera sincronización está en cola."
    : params.manual
      ? `${params.manual} día(s) de coste guardados.`
      : params.sync
        ? "Sincronización añadida a la cola."
        : params.assigned
          ? "La campaña quedó relacionada y se aplicó a sus costes históricos."
          : null;

  return (
    <>
      <div className="management-heading">
        <div>
          <p className="dashboard-eyebrow">COSTES PUBLICITARIOS</p>
          <h1>Sabe cuánto cuesta cada resultado</h1>
          <p>Conecta tus cuentas o añade el gasto manualmente. Attruvi conserva la moneda original y relaciona el coste con campaña, grupo y anuncio.</p>
        </div>
      </div>

      {message ? <p className="management-notice" role="status">{message}</p> : null}
      {params.error ? <p className="management-notice management-notice-error" role="alert">No se ha podido completar la operación. Revisa los datos o vuelve a conectar la cuenta.</p> : null}

      {management.apps.length > 0 ? (
        <nav aria-label="Selecciona una aplicación" className="app-tabs">
          {management.apps.map((app) => <Link className={app.id === management.selectedApp?.id ? "active" : undefined} href={`/dashboard/integrations?workspace=${encodeURIComponent(management.organization.slug)}&app=${encodeURIComponent(app.slug)}&environment=${encodeURIComponent(params.environment ?? "production")}`} key={app.id}>{app.name}</Link>)}
        </nav>
      ) : null}

      {!management.selectedApp ? (
        <div className="management-empty"><span aria-hidden="true">▣</span><h2>Primero añade una app</h2><p>Los costes se separan por aplicación.</p><Link className="management-primary-link" href="/dashboard/apps?new=1">Añadir app</Link></div>
      ) : (
        <>
          <section className="cost-summary-grid" aria-label="Resumen de gasto">
            {management.spendByCurrency.length > 0 ? management.spendByCurrency.map((total) => (
              <article key={total.currency}><span>Gasto importado</span><strong>{formatMoney(total.amountMinor, total.currency)}</strong><small>Sin conversión de moneda</small></article>
            )) : <article><span>Gasto importado</span><strong>0,00 {management.selectedApp.currency}</strong><small>Aún no hay costes</small></article>}
            <article><span>Sin relacionar</span><strong>{management.unmatchedCount.toLocaleString("es-ES")}</strong><small>Nunca se eliminan automáticamente</small></article>
            <article><span>Cuentas conectadas</span><strong>{management.connectors.filter((account) => account.provider !== "manual").length}</strong><small>Google, Meta y TikTok</small></article>
          </section>

          <section className="connector-section">
            <div className="cost-section-heading"><div><span>01</span><h2>Conecta tus plataformas</h2></div><p>Solo verás el nombre de la cuenta, su estado y los últimos cuatro caracteres del identificador.</p></div>
            <div className="connector-grid">
              {management.configurations.map((configuration) => {
                const accounts = management.connectors.filter((account) => account.provider === configuration.provider);
                const showSetup = params.setup === configuration.provider || !configuration.configured;
                return (
                  <article className="connector-card" key={configuration.provider}>
                    <div className={`connector-logo connector-logo-${providerClass[configuration.provider]}`}>{configuration.label.slice(0, 1)}</div>
                    <div className="connector-card-title"><div><h3>{configuration.label}</h3><span>API {configuration.apiVersion}</span></div>{canConfigure ? <Link href={`/api/connectors/${configuration.provider}/start?app=${management.selectedApp?.id}`}>{accounts.length ? "Añadir otra cuenta" : `Conectar ${configuration.label.replace(" Ads", "")}`}</Link> : null}</div>
                    {accounts.length > 0 ? <div className="connector-accounts">{accounts.map((account) => {
                      const syncAction = enqueueCostSyncAction.bind(null, account.id, management.selectedApp!.id);
                      return <div key={account.id}><div><strong>{account.account_name || configuration.label}</strong><span>{account.external_account_hint || "Identificador oculto"} · {account.account_currency || management.selectedApp?.currency}</span></div><div><span className={`connector-state connector-state-${account.connection_state}`}>{statusLabel[account.connection_state] || account.connection_state}</span><small>{account.last_synced_at ? `Último sync ${new Date(account.last_synced_at).toLocaleDateString("es-ES")}` : "Sin sincronizar"}</small></div>{canConfigure ? <form action={syncAction}><button type="submit">Sincronizar</button></form> : null}</div>;
                    })}</div> : <p className="connector-empty-copy">Todavía no hay ninguna cuenta de {configuration.label} conectada.</p>}
                    {showSetup && !configuration.configured ? <details className="connector-setup" open={params.setup === configuration.provider}><summary>Qué falta configurar</summary><ol>{configuration.pendingSteps.map((step) => <li key={step}>{step}</li>)}</ol><p>Variables en Vercel</p><code>{configuration.environmentNames.join(" · ")}</code><p>URL callback exacta</p><code>{configuration.callbackUrl}</code><a href={configuration.documentationUrl} rel="noreferrer" target="_blank">Abrir documentación oficial ↗</a></details> : null}
                  </article>
                );
              })}
            </div>
          </section>

          {canConfigure ? <section className="manual-cost-section">
            <div className="cost-section-heading"><div><span>02</span><h2>Añadir coste manual</h2></div><p>Para afiliados, influencers u otras fuentes sin integración. Puedes guardar un día, repartir un total por rango o cargar CSV.</p></div>
            <form action={addManualCostsAction} className="manual-cost-form">
              <input name="app_id" type="hidden" value={management.selectedApp.id} />
              <label><span>Forma de carga</span><select defaultValue="daily" name="mode"><option value="daily">Un solo día</option><option value="range">Repartir entre varias fechas</option><option value="csv">Archivo CSV</option></select></label>
              <label><span>Desde</span><input defaultValue={today} name="from" required type="date" /></label>
              <label><span>Hasta</span><input defaultValue={today} name="to" required type="date" /></label>
              <label><span>Importe total</span><input inputMode="decimal" name="amount" placeholder="125.50" /></label>
              <label><span>Moneda</span><input defaultValue={management.selectedApp.currency} maxLength={3} name="currency" required /></label>
              <label><span>ID externo de campaña</span><input name="campaign_external_id" placeholder="Opcional" /></label>
              <label><span>Nombre de campaña</span><input name="campaign_name" placeholder="Influencer septiembre" /></label>
              <label className="manual-file-field"><span>CSV</span><input accept=".csv,text/csv" name="csv" type="file" /><small>Columnas obligatorias: date, amount, currency. Máximo 1.000 filas.</small></label>
              <button type="submit">Guardar costes</button>
            </form>
          </section> : <div className="permission-banner"><span aria-hidden="true">◉</span><div><strong>Integraciones en solo lectura</strong><p>Tu rol viewer puede consultar estados y costes, pero no conectar cuentas ni modificar datos.</p></div></div>}

          <section className="unmatched-section">
            <div className="cost-section-heading"><div><span>03</span><h2>Sin relacionar</h2></div><p>Estos importes se conservan. Asígnalos a una campaña cuando reconozcas su identificador.</p></div>
            {management.unmatched.length > 0 ? <div className="unmatched-table-wrap"><table className="unmatched-table"><thead><tr><th>Origen</th><th>Fecha</th><th>Campaña recibida</th><th>Coste</th><th>Asignar a</th></tr></thead><tbody>{management.unmatched.map((cost) => (
              <tr key={cost.id}><td>{cost.provider.replace("_ads", "")}</td><td>{new Date(`${cost.cost_date}T00:00:00Z`).toLocaleDateString("es-ES")}</td><td><strong>{cost.campaign_name || "Sin nombre"}</strong><small>{cost.campaign_external_id ? `····${cost.campaign_external_id.slice(-4)}` : cost.unmatched_reason || "Sin identificador"}</small></td><td>{formatMoney(BigInt(cost.amount_minor), cost.currency)}</td><td>{canConfigure && cost.campaign_external_id && management.campaigns.length > 0 ? <form action={assignCostCampaignAction}><input name="app_id" type="hidden" value={management.selectedApp.id} /><input name="cost_id" type="hidden" value={cost.id} /><select aria-label="Campaña de Attruvi" name="campaign_id" required><option value="">Elige campaña</option>{management.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><button type="submit">Asignar</button></form> : <span>{canConfigure ? "Falta ID de campaña" : "Solo lectura"}</span>}</td></tr>
            ))}</tbody></table></div> : <div className="cost-empty-state"><span aria-hidden="true">✓</span><div><h3>Todo está relacionado</h3><p>No hay costes esperando asignación.</p></div></div>}
          </section>

          {management.runs.length > 0 ? <section className="sync-history"><div className="cost-section-heading"><div><span>04</span><h2>Últimas sincronizaciones</h2></div></div><div>{management.runs.map((run) => {
            const account = management.connectors.find((candidate) => candidate.id === run.connector_account_id);
            return <article key={run.id}><div><strong>{account?.account_name || "Cuenta publicitaria"}</strong><span>{run.sync_from} → {run.sync_to}</span></div><div><strong>{run.rows_written.toLocaleString("es-ES")} filas</strong><span className={`sync-status sync-status-${run.status}`}>{run.status === "succeeded" ? "Completada" : run.status === "running" ? "En curso" : run.status === "pending" ? "En cola" : "Necesita atención"}</span></div></article>;
          })}</div></section> : null}
        </>
      )}
    </>
  );
}
