import Link from "next/link";
import { AppForm } from "@/components/apps/app-form";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getAppsManagement } from "@/lib/data/apps";

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; edit?: string; environment?: string; new?: string; saved?: string; workspace?: string }>;
}) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const { apps, organization, role } = await getAppsManagement(identity, params.app, params.workspace);
  const editedApp = apps.find((app) => app.id === params.edit);
  const canConfigure = role === "owner" || role === "admin";
  const showForm = canConfigure && (params.new === "1" || Boolean(editedApp));

  return (
    <>
      <div className="management-heading">
        <div><p className="dashboard-eyebrow">APLICACIONES</p><h1>Tus apps React Native</h1><p>Cada app mantiene separados sus enlaces, clics, atribuciones, eventos e ingresos.</p></div>
        {!showForm && canConfigure ? <Link className="management-primary-link" href={`/dashboard/apps?workspace=${encodeURIComponent(organization.slug)}&new=1`}>Añadir app</Link> : null}
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
            <div className="app-card-actions"><Link href={`/dashboard/links?workspace=${encodeURIComponent(organization.slug)}&app=${encodeURIComponent(app.slug)}`}>Ver enlaces</Link>{canConfigure ? <Link href={`/dashboard/apps?workspace=${encodeURIComponent(organization.slug)}&app=${encodeURIComponent(app.slug)}&edit=${app.id}`}>Editar</Link> : null}</div>
          </article>
        ))}
        {apps.length === 0 ? <div className="management-empty"><span aria-hidden="true">▣</span><h2>Aún no hay aplicaciones</h2><p>Añade la primera para empezar a crear enlaces.</p></div> : null}
      </div>

      {!canConfigure ? <div className="permission-banner"><span aria-hidden="true">◉</span><div><strong>Acceso de solo lectura</strong><p>Un viewer puede consultar las apps, pero no crearlas ni editarlas.</p></div></div> : null}
      {showForm ? <AppForm app={editedApp} /> : null}
    </>
  );
}
