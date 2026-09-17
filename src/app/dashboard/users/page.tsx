import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getUserExplorer, shortIdentifier } from "@/lib/data/users";

const payerLabels: Record<string, string> = {
  never_paid: "Sin pagos", refunded: "Reembolsado", reported: "Pago declarado", verified: "Pago verificado",
};
const kindLabels: Record<string, string> = {
  click: "Clic", event: "Evento", installation: "Instalación", postback: "Postback", revenue: "Ingreso", session: "Sesión",
};

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(value: number | string, currency: string) {
  const minor = BigInt(String(value));
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const sign = minor < zero ? "−" : "";
  const absolute = minor < zero ? -minor : minor;
  return `${sign}${absolute / hundred},${(absolute % hundred).toString().padStart(2, "0")} ${currency}`;
}

function href(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return `/dashboard/users?${query.toString()}`;
}

export default async function UsersPage({ searchParams }: {
  searchParams: Promise<{ app?: string; page?: string; payer?: string; platform?: string; user?: string }>;
}) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const explorer = await getUserExplorer(identity, params);

  return (
    <DashboardShell active="users" appName={explorer.selectedApp?.name} displayName={identity.displayName} organizationName={explorer.organization.name}>
      <div className="management-heading"><div><p className="dashboard-eyebrow">ACTIVIDAD ANONIMIZADA</p><h1>Qué hacen los usuarios después de instalar</h1><p>Recorre clics, sesiones, compras y conversiones sin mostrar correos, nombres ni otros datos personales.</p></div></div>

      {explorer.apps.length > 0 ? <nav aria-label="Selecciona una aplicación" className="app-tabs">
        {explorer.apps.map((app) => <Link className={app.id === explorer.selectedApp?.id ? "active" : undefined} href={href({ app: app.id })} key={app.id}>{app.name}</Link>)}
      </nav> : null}

      {!explorer.selectedApp ? <div className="management-empty"><span aria-hidden="true">▣</span><h2>Primero añade una app</h2><p>El explorador necesita una aplicación para separar los usuarios.</p><Link className="management-primary-link" href="/dashboard/apps?new=1">Añadir app</Link></div> : <>
        <form className="user-filters" method="get">
          <input name="app" type="hidden" value={explorer.selectedApp.id} />
          <label>Estado de pago<select defaultValue={explorer.filters.payer ?? ""} name="payer"><option value="">Todos</option><option value="never_paid">Sin pagos</option><option value="reported">Pago declarado</option><option value="verified">Pago verificado</option><option value="refunded">Reembolsado</option></select></label>
          <label>Plataforma<select defaultValue={explorer.filters.platform ?? ""} name="platform"><option value="">iOS y Android</option><option value="ios">iOS</option><option value="android">Android</option></select></label>
          <button type="submit">Aplicar filtros</button><span>{explorer.total.toLocaleString("es-ES")} perfiles</span>
        </form>

        <div className="user-explorer-layout">
          <section className="dashboard-table-card user-list-card">
            <div className="dashboard-table-scroll"><table><thead><tr><th>Usuario anónimo</th><th>Instalaciones</th><th>Sesiones</th><th>Última actividad</th><th>LTV observado</th></tr></thead><tbody>
              {explorer.users.map((user) => <tr className={params.user === user.app_user_id ? "selected" : undefined} key={user.app_user_id}>
                <td><Link href={href({ app: explorer.selectedApp!.id, page: explorer.filters.page, payer: explorer.filters.payer, platform: explorer.filters.platform, user: user.app_user_id })}><i className={`user-status status-${user.payer_status}`} aria-hidden="true" /><span><strong>{shortIdentifier(user.app_user_id)}</strong><small>{payerLabels[user.payer_status]}</small></span></Link></td>
                <td>{user.installation_count}</td><td>{user.session_count}</td><td>{dateTime(user.last_activity_at)}</td><td><strong>{money(user.ltv_observed_minor, user.ltv_currency)}</strong></td>
              </tr>)}
            </tbody></table></div>
            {explorer.users.length === 0 ? <div className="dashboard-empty"><h3>No hay perfiles con esos filtros</h3><p>Prueba otra plataforma o estado de pago.</p></div> : null}
            {explorer.pageCount > 1 ? <nav aria-label="Páginas de usuarios" className="user-pagination">
              {explorer.filters.page > 1 ? <Link href={href({ app: explorer.selectedApp.id, page: explorer.filters.page - 1, payer: explorer.filters.payer, platform: explorer.filters.platform })}>← Anterior</Link> : <span />}
              <strong>Página {explorer.filters.page} de {explorer.pageCount}</strong>
              {explorer.filters.page < explorer.pageCount ? <Link href={href({ app: explorer.selectedApp.id, page: explorer.filters.page + 1, payer: explorer.filters.payer, platform: explorer.filters.platform })}>Siguiente →</Link> : <span />}
            </nav> : null}
          </section>

          <aside className="user-detail-panel">
            {explorer.detail ? <>
              <header><div><span>PERFIL ANÓNIMO</span><h2>{shortIdentifier(explorer.detail.profile.id)}</h2></div><Link href={href({ app: explorer.selectedApp.id, page: explorer.filters.page, payer: explorer.filters.payer, platform: explorer.filters.platform })} aria-label="Cerrar detalle">×</Link></header>
              <div className="user-detail-metrics">
                <div><span>Días desde instalación</span><strong>{explorer.detail.daysSinceInstall}</strong></div>
                <div><span>Sesiones</span><strong>{explorer.detail.metrics.session_count}</strong></div>
                <div><span>Estado</span><strong>{payerLabels[explorer.detail.metrics.payer_status]}</strong></div>
                <div><span>LTV observado</span><strong>{money(explorer.detail.metrics.ltv_observed_minor, explorer.detail.metrics.ltv_currency)}</strong></div>
              </div>
              <ol className="user-timeline">{explorer.detail.timeline.map((item) => <li className={`timeline-${item.kind}`} key={item.id}><i aria-hidden="true" /><div><span>{kindLabels[item.kind]}</span><strong>{item.label}</strong><p>{item.detail}</p>{item.meta ? <small>{item.meta}</small> : null}</div><time>{dateTime(item.at)}</time></li>)}</ol>
              {explorer.detail.timeline.length === 0 ? <div className="dashboard-empty"><p>Este perfil todavía no tiene actividad procesada.</p></div> : null}
            </> : <div className="user-detail-placeholder"><span aria-hidden="true">⌁</span><h2>Selecciona un usuario</h2><p>Verás su recorrido completo sin datos personales.</p></div>}
          </aside>
        </div>
      </>}
    </DashboardShell>
  );
}
