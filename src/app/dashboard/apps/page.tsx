import Link from "next/link";
import { AppForm } from "@/components/apps/app-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getAppsManagement } from "@/lib/data/apps";

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string; saved?: string }>;
}) {
  const identity = await requireVerifiedIdentity();
  const { apps, organization } = await getAppsManagement(identity);
  const params = await searchParams;
  const editedApp = apps.find((app) => app.id === params.edit);
  const showForm = params.new === "1" || Boolean(editedApp);

  return (
    <DashboardShell active="apps" appName={editedApp?.name ?? apps[0]?.name} displayName={identity.displayName} organizationName={organization.name}>
      <div className="management-heading">
        <div><p className="dashboard-eyebrow">APLICACIONES</p><h1>Tus apps React Native</h1><p>Cada app mantiene separados sus enlaces, clics, atribuciones, eventos e ingresos.</p></div>
        {!showForm ? <Link className="management-primary-link" href="/dashboard/apps?new=1">Añadir app</Link> : null}
      </div>

      {params.saved ? <p className="management-notice" role="status">{params.saved === "updated" ? "App actualizada correctamente." : "App creada correctamente."}</p> : null}

      <div className="apps-overview">
        {apps.map((app) => (
          <article className="app-card" key={app.id}>
            <div className="app-card-top"><span className={`status-pill status-${app.status}`}>{app.status === "active" ? "Activa" : app.status === "paused" ? "Pausada" : "Desactivada"}</span><small>{app.platform === "both" ? "iOS + Android" : app.platform === "ios" ? "iOS" : "Android"}</small></div>
            <div><h2>{app.name}</h2><p>{app.smartLinkCount} {app.smartLinkCount === 1 ? "enlace inteligente" : "enlaces inteligentes"}</p></div>
            <dl>
              {app.iosBundleId ? <div><dt>Bundle ID</dt><dd>{app.iosBundleId}</dd></div> : null}
              {app.androidPackageName ? <div><dt>Package name</dt><dd>{app.androidPackageName}</dd></div> : null}
              <div><dt>Datos</dt><dd>{app.currency} · {app.timezone}</dd></div>
            </dl>
            <div className="app-card-actions"><Link href={`/dashboard/links?app=${app.id}`}>Ver enlaces</Link><Link href={`/dashboard/apps?edit=${app.id}`}>Editar</Link></div>
          </article>
        ))}
        {apps.length === 0 ? <div className="management-empty"><span aria-hidden="true">▣</span><h2>Aún no hay aplicaciones</h2><p>Añade la primera para empezar a crear enlaces.</p></div> : null}
      </div>

      {showForm ? <AppForm app={editedApp} /> : null}
    </DashboardShell>
  );
}
