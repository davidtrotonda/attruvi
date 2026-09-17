import Link from "next/link";
import { CopyLinkButton } from "@/components/smart-links/link-actions";
import { SmartLinkForm } from "@/components/smart-links/smart-link-form";
import { setSmartLinkStatusAction } from "@/app/dashboard/links/actions";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getSmartLinksManagement } from "@/lib/data/apps";
import { smartLinkSourceLabels } from "@/lib/smart-links/shared";

export default async function SmartLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; cache?: string; edit?: string; environment?: string; new?: string; saved?: string; workspace?: string }>;
}) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const management = await getSmartLinksManagement(identity, params.app, params.workspace);
  const editedLink = management.links.find((link) => link.id === params.edit);
  const canConfigure = management.role === "owner" || management.role === "admin";
  const showForm = canConfigure && (params.new === "1" || Boolean(editedLink));

  return (
    <>
      <div className="management-heading">
        <div><p className="dashboard-eyebrow">ENLACES INTELIGENTES</p><h1>Del anuncio a tu app</h1><p>Crea un enlace por campaña o anuncio. Attruvi registra el clic y abre directamente la app, la tienda o tu web.</p></div>
        {management.selectedApp && !showForm && canConfigure ? <Link className="management-primary-link" href={`/dashboard/links?workspace=${encodeURIComponent(management.organization.slug)}&app=${encodeURIComponent(management.selectedApp.slug)}&new=1`}>Crear enlace</Link> : null}
      </div>

      {params.saved ? (
        <p className="management-notice" role="status">
          {params.saved === "updated" ? "Enlace actualizado." : "Enlace creado."}
          {params.cache === "pending" ? " La caché se actualizará en unos segundos." : ""}
        </p>
      ) : null}

      {management.apps.length > 0 ? (
        <nav aria-label="Selecciona una aplicación" className="app-tabs">
          {management.apps.map((app) => <Link className={app.id === management.selectedApp?.id ? "active" : undefined} href={`/dashboard/links?workspace=${encodeURIComponent(management.organization.slug)}&app=${encodeURIComponent(app.slug)}&environment=${encodeURIComponent(params.environment ?? "production")}`} key={app.id}>{app.name}<small>{app.smartLinkCount}</small></Link>)}
        </nav>
      ) : null}

      {!management.selectedApp ? (
        <div className="management-empty"><span aria-hidden="true">▣</span><h2>Primero añade una app</h2><p>El enlace necesita saber a qué aplicación y tiendas debe enviar a la persona.</p><Link className="management-primary-link" href="/dashboard/apps?new=1">Añadir app</Link></div>
      ) : showForm ? (
        <SmartLinkForm appId={management.selectedApp.id} draft={editedLink} />
      ) : management.links.length > 0 ? (
        <div className="smart-link-list">
          {management.links.map((link) => {
            const nextStatus = link.status === "active" ? "disabled" : "active";
            const statusAction = setSmartLinkStatusAction.bind(null, link.id, link.slug, nextStatus);
            return (
              <article className="smart-link-card" key={link.id}>
                <div className="smart-link-main">
                  <div className="smart-link-title-row"><span className={`source-badge source-badge-${link.sourceKind}`}>{smartLinkSourceLabels[link.sourceKind]}</span><span className={`status-pill status-${link.status}`}>{link.status === "active" ? "Activo" : link.status === "paused" ? "Pausado" : "Desactivado"}</span></div>
                  <h2>{link.name}</h2>
                  <div className="smart-link-url"><code>{link.publicUrl}</code><CopyLinkButton url={link.publicUrl} /></div>
                  <p>{link.campaignName || "Sin campaña"}{link.adGroupName ? ` → ${link.adGroupName}` : ""}{link.adName ? ` → ${link.adName}` : ""}</p>
                </div>
                <div className="smart-link-clicks" aria-label="Clics registrados">
                  <div><strong>{link.clicks.total.toLocaleString("es-ES")}</strong><span>Clics válidos</span></div>
                  <div><strong>{link.clicks.ios.toLocaleString("es-ES")}</strong><span>iOS</span></div>
                  <div><strong>{link.clicks.android.toLocaleString("es-ES")}</strong><span>Android</span></div>
                  <div><strong>{link.clicks.web.toLocaleString("es-ES")}</strong><span>Web</span></div>
                </div>
                <div className="smart-link-card-actions">
                  <a href={link.testUrl} rel="noreferrer" target="_blank">Probar <span aria-hidden="true">↗</span></a>
                  {canConfigure ? <Link href={`/dashboard/links?workspace=${encodeURIComponent(management.organization.slug)}&app=${encodeURIComponent(management.selectedApp?.slug ?? "")}&edit=${link.id}`}>Editar</Link> : null}
                  {canConfigure ? <form action={statusAction}><button type="submit">{link.status === "active" ? "Desactivar" : "Activar"}</button></form> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="management-empty"><span aria-hidden="true">↗</span><h2>{canConfigure ? "Crea tu primer enlace" : "Aún no hay enlaces"}</h2><p>Elige el origen, el anuncio y las tiendas. Al compartirlo, no habrá ninguna pantalla de redirección.</p>{canConfigure ? <Link className="management-primary-link" href={`/dashboard/links?workspace=${encodeURIComponent(management.organization.slug)}&app=${encodeURIComponent(management.selectedApp.slug)}&new=1`}>Crear enlace</Link> : null}</div>
      )}
    </>
  );
}
