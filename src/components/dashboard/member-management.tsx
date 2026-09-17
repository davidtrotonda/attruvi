"use client";

import { useActionState, useState } from "react";
import { createInvitationAction, type InvitationActionState } from "@/app/dashboard/settings/actions";

const initialState: InvitationActionState = {};

export function MemberManagement({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createInvitationAction, initialState);
  const [copied, setCopied] = useState(false);
  return <div className="team-invite-box">
    <form action={action}>
      <input name="organization_id" type="hidden" value={organizationId} />
      <label><span>Correo</span><input autoComplete="email" name="email" placeholder="persona@empresa.com" required type="email" /></label>
      <label><span>Rol</span><select defaultValue="viewer" name="role"><option value="viewer">Viewer — solo lectura</option><option value="admin">Admin — configura apps</option><option value="owner">Owner — gestiona el equipo</option></select></label>
      <button disabled={pending} type="submit">{pending ? "Creando…" : "Crear invitación"}</button>
    </form>
    {state.message ? <p className={state.success ? "form-result form-result-success" : "form-result form-result-error"} role="status">{state.message}</p> : null}
    {state.invitationUrl ? <div className="invitation-link"><code>{state.invitationUrl}</code><button onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} type="button">{copied ? "Copiado" : "Copiar enlace"}</button></div> : null}
  </div>;
}
