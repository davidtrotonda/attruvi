"use client";

import { useActionState } from "react";
import { createSdkKeyAction, type SdkKeyActionState } from "@/app/dashboard/setup/actions";
import { CopyButton } from "@/components/setup/copy-button";

const initialState: SdkKeyActionState = {};

export function SdkKeyControl({ appId, hasActiveKey, canConfigure, visiblePrefix }: {
  appId: string;
  canConfigure: boolean;
  hasActiveKey: boolean;
  visiblePrefix?: string;
}) {
  const [state, action, pending] = useActionState(createSdkKeyAction, initialState);
  if (!canConfigure) return <p className="setup-readonly">Un owner o admin debe crear o rotar esta clave.</p>;
  return <div className="setup-key-control">
    {state.appKey ? <div className="setup-key-reveal" role="status"><span>APPKEY PÚBLICA · SOLO ESTA VEZ</span><code>{state.appKey}</code><CopyButton label="Copiar appKey" text={state.appKey} /><p>{state.message}</p></div> : null}
    {!state.appKey && hasActiveKey ? <div className="setup-key-existing"><code>{visiblePrefix}••••••••</code><span>Activa en development</span></div> : null}
    {state.message && !state.appKey ? <p className="setup-action-message" role="alert">{state.message}</p> : null}
    <form action={action}>
      <input name="app_id" type="hidden" value={appId} />
      <input name="rotate" type="hidden" value={hasActiveKey ? "1" : "0"} />
      <button disabled={pending} type="submit">{pending ? "Creando…" : hasActiveKey ? "Rotar clave" : "Crear clave pública"}</button>
    </form>
    <p className="setup-security-note">La appKey identifica esta app y development. No permite leer datos. No pegues aquí claves privadas de otras plataformas.</p>
  </div>;
}
