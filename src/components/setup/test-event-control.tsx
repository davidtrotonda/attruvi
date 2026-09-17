"use client";

import { useActionState } from "react";
import { sendDevelopmentTestEventAction, type TestEventActionState } from "@/app/dashboard/setup/actions";

const initialState: TestEventActionState = {};

export function TestEventControl({ appId, canConfigure, hasDevelopmentKey }: {
  appId: string;
  canConfigure: boolean;
  hasDevelopmentKey: boolean;
}) {
  const [state, action, pending] = useActionState(sendDevelopmentTestEventAction, initialState);
  return <form action={action} className="setup-test-form">
    <input name="app_id" type="hidden" value={appId} />
    <label><span>Evento de prueba</span><select defaultValue="sign_up" name="event_name"><option value="sign_up">Registro</option><option value="purchase">Compra de 49,90</option><option value="subscription_started">Suscripción de 9,99</option></select></label>
    <button disabled={pending || !canConfigure || !hasDevelopmentKey} type="submit">{pending ? "Recorriendo el pipeline…" : "Enviar a development"}</button>
    {!hasDevelopmentKey ? <p>Crea primero la appKey pública de development.</p> : null}
    {state.message ? <p className={state.success ? "setup-action-success" : "setup-action-message"} role="status">{state.message}{state.requestId ? ` Solicitud ${state.requestId.slice(0, 8)}…` : ""}</p> : null}
  </form>;
}
