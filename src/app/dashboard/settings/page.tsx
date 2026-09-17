import Link from "next/link";
import { changeMemberRoleAction, updatePrivacySettingsAction } from "@/app/dashboard/settings/actions";
import { MemberManagement } from "@/components/dashboard/member-management";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dashboard/format";
import { dashboardHref, firstParam, parseDashboardFilters, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { getSettingsDashboard } from "@/lib/data/operations";

const roleLabels = { admin: "Admin", owner: "Owner", viewer: "Viewer" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const settings = await getSettingsDashboard(identity, filters);
  const app = settings.selectedApp;
  const canConfigure = settings.role === "owner" || settings.role === "admin";
  const invitation = firstParam(params.invitation);
  const saved = firstParam(params.saved);
  const error = firstParam(params.error);
  const message = invitation === "accepted" ? "Te has unido al proyecto correctamente." : saved === "role" ? "Rol actualizado." : saved === "privacy" ? "Privacidad y retención actualizadas." : null;

  return <>
    <div className="management-heading"><div><p className="dashboard-eyebrow">AJUSTES</p><h1>Proyecto, app y equipo.</h1><p>Consulta la configuración activa y decide quién puede verla o cambiarla.</p></div>{app && canConfigure ? <Link className="management-primary-link" href={`/dashboard/apps?edit=${app.id}`}>Editar app</Link> : null}</div>
    {message ? <p className="management-notice" role="status">{message}</p> : null}
    {error ? <p className="management-notice management-notice-error" role="alert">{error === "last-owner" ? "Debe quedar al menos un owner." : error === "invitation" ? "La invitación no es válida, ha caducado o pertenece a otro correo." : "No tienes permiso para realizar ese cambio."}</p> : null}
    {settings.role === "viewer" ? <div className="permission-banner"><span aria-hidden="true">◉</span><div><strong>Acceso de solo lectura</strong><p>Puedes consultar métricas y actividad, pero no cambiar apps, integraciones ni miembros.</p></div></div> : null}

    {app ? <section className="settings-grid">
      <article className="settings-card"><header><div><span>APLICACIÓN ACTIVA</span><h2>{app.name}</h2></div><span className={`status-pill status-${app.status}`}>{app.status === "active" ? "Activa" : app.status === "paused" ? "Pausada" : "Desactivada"}</span></header><dl><div><dt>Proyecto</dt><dd>{app.organizationName}</dd></div><div><dt>Moneda</dt><dd>{app.currency}</dd></div><div><dt>Zona horaria</dt><dd>{app.timezone}</dd></div>{settings.platforms.map((platform) => <div key={platform.platform}><dt>{platform.platform === "ios" ? "Bundle ID" : "Package name"}</dt><dd>{platform.ios_bundle_id ?? platform.android_package_name}</dd></div>)}</dl></article>
      <article className="settings-card"><header><div><span>SDK PÚBLICO</span><h2>Claves por entorno</h2></div></header>{settings.sdkKeys.length ? <ul className="settings-key-list">{settings.sdkKeys.map((key) => <li key={key.id}><code>{key.visible_prefix}••••••••</code><span>{key.environment} · {key.status}</span><small>Último uso: {formatDateTime(key.last_used_at, app.timezone)}</small></li>)}</ul> : <div className="settings-card-empty"><p>Todavía no hay una clave pública del SDK.</p><span>No es un secreto y nunca concede lectura.</span></div>}</article>
    </section> : <div className="management-empty"><span aria-hidden="true">▣</span><h2>Aún no hay una app</h2><p>Completa el onboarding para crearla.</p><Link className="management-primary-link" href="/onboarding">Empezar</Link></div>}

    {app && settings.privacy ? <section className="team-section privacy-settings-section">
      <div className="cost-section-heading"><div><span>PRIVACIDAD</span><h2>Finalidades y retención</h2></div><p>Los identificadores persistentes son seudónimos dentro de esta app, no anonimato irreversible. Reduce estos plazos según tu necesidad real.</p></div>
      <form action={updatePrivacySettingsAction} className="privacy-settings-form">
        <input name="app_id" type="hidden" value={app.id} />
        <label>Clics e identificadores de red (días)<input defaultValue={settings.privacy.raw_click_retention_days} disabled={!canConfigure} max="3650" min="1" name="click_days" type="number" /></label>
        <label>Propiedades de eventos (días)<input defaultValue={settings.privacy.event_properties_retention_days} disabled={!canConfigure} max="3650" min="1" name="event_days" type="number" /></label>
        <label>Debugger de desarrollo (días)<input defaultValue={settings.privacy.debug_retention_days} disabled={!canConfigure} max="90" min="1" name="debug_days" type="number" /></label>
        <label>Detalles de postback (días)<input defaultValue={settings.privacy.postback_detail_retention_days} disabled={!canConfigure} max="730" min="1" name="postback_days" type="number" /></label>
        <label>Auditoría administrativa (días)<input defaultValue={settings.privacy.audit_retention_days} disabled={!canConfigure} max="3650" min="30" name="audit_days" type="number" /></label>
        <label className="privacy-settings-wide">Nota de base legal (no introduzcas PII)<textarea defaultValue={settings.privacy.legal_basis_note ?? ""} disabled={!canConfigure} maxLength={500} name="legal_basis_note" /></label>
        <label className="privacy-purpose-toggle"><input defaultChecked={settings.privacy.allow_probabilistic_attribution} disabled={!canConfigure} name="probabilistic" type="checkbox" /> Permitir atribución probabilística limitada cuando sea legal y exista consentimiento</label>
        {canConfigure ? <button type="submit">Guardar privacidad</button> : null}
      </form>
      {canConfigure ? <div className="privacy-export-row"><p>La exportación completa usa NDJSON para no cargar millones de filas en el navegador.</p><a href={`/api/private/privacy/export-app?app=${encodeURIComponent(app.id)}`}>Exportar datos de la app</a></div> : null}
    </section> : null}

    {settings.organization ? <section className="team-section">
      <div className="cost-section-heading"><div><span>01</span><h2>Equipo y permisos</h2></div><p>Solo un owner puede invitar personas o cambiar roles. Los viewers nunca modifican la configuración.</p></div>
      <div className="team-table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Desde</th><th>Permisos</th></tr></thead><tbody>{settings.members.map((member) => <tr key={member.member_id}><td><strong>{member.display_name}</strong><span>{member.email}</span></td><td>{settings.role === "owner" ? <form action={changeMemberRoleAction}><input name="organization_id" type="hidden" value={settings.organization!.id} /><input name="user_id" type="hidden" value={member.user_id} /><select aria-label={`Rol de ${member.display_name}`} defaultValue={member.role} name="role"><option value="owner">Owner</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select><button type="submit">Guardar</button></form> : <span className={`role-pill role-${member.role}`}>{roleLabels[member.role]}</span>}</td><td>{formatDateTime(member.joined_at, app?.timezone)}</td><td>{member.role === "owner" ? "Equipo y configuración" : member.role === "admin" ? "Configuración, sin roles" : "Solo lectura"}</td></tr>)}</tbody></table></div>
      {settings.role === "owner" ? <><MemberManagement organizationId={settings.organization.id} />{settings.invitations.length ? <div className="pending-invitations"><h3>Invitaciones pendientes</h3>{settings.invitations.map((invitation) => <div key={invitation.id}><span>{invitation.email}</span><strong>{roleLabels[invitation.role as keyof typeof roleLabels] ?? "Viewer"}</strong><small>Caduca {formatDateTime(invitation.expires_at, app?.timezone)}</small></div>)}</div> : null}</> : null}
    </section> : null}

    {canConfigure && app ? <div className="dashboard-next-step"><span>↗</span><div><strong>Completa la medición</strong><p>Revisa enlaces, integraciones y eventos de esta app.</p></div><Link href={dashboardHref("/dashboard/integrations", { app: app.slug, environment: filters.environment, workspace: app.organizationSlug })}>Ver integraciones</Link></div> : null}
  </>;
}
