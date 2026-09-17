"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveAppAction, type AppActionState } from "@/app/dashboard/apps/actions";

type AppDraft = {
  androidPackageName: string | null;
  currency: string;
  id: string;
  iosBundleId: string | null;
  name: string;
  platform: "android" | "both" | "ios";
  status: "active" | "disabled" | "paused";
  timezone: string;
};

const initialState: AppActionState = {};
const timezones = [
  "Europe/Madrid", "UTC", "America/Mexico_City", "America/Bogota",
  "America/Argentina/Buenos_Aires", "America/Santiago", "America/New_York",
];

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <small className="builder-field-error">{errors[0]}</small> : null;
}

export function AppForm({ app }: { app?: AppDraft }) {
  const [state, action, pending] = useActionState(saveAppAction, initialState);
  const [platform, setPlatform] = useState(app?.platform ?? "both");

  return (
    <form action={action} className="management-form">
      <input name="app_id" type="hidden" value={app?.id ?? ""} />
      <div className="management-form-heading">
        <div><span>{app ? "EDITAR APP" : "NUEVA APP"}</span><h2>{app ? app.name : "Añade otra aplicación"}</h2></div>
        <p>Solo necesitamos los identificadores públicos que ya usa tu proyecto React Native.</p>
      </div>

      <div className="management-form-grid">
        <label className="field-span-two">
          <span>Nombre de la app</span>
          <input defaultValue={app?.name ?? ""} maxLength={120} name="name" placeholder="Por ejemplo, Tourixy" required />
          <FieldError errors={state.errors?.name} />
        </label>
        <fieldset className="platform-picker field-span-two">
          <legend>Plataformas</legend>
          {([['ios', 'iOS'], ['android', 'Android'], ['both', 'Ambas']] as const).map(([value, label]) => (
            <label key={value}>
              <input checked={platform === value} name="platform" onChange={() => setPlatform(value)} type="radio" value={value} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        {platform === "ios" || platform === "both" ? (
          <label><span>Bundle ID de iOS</span><input defaultValue={app?.iosBundleId ?? ""} name="ios_bundle_id" placeholder="com.empresa.app" required /><FieldError errors={state.errors?.iosBundleId} /></label>
        ) : <input name="ios_bundle_id" type="hidden" value="" />}
        {platform === "android" || platform === "both" ? (
          <label><span>Package name de Android</span><input defaultValue={app?.androidPackageName ?? ""} name="android_package_name" placeholder="com.empresa.app" required /><FieldError errors={state.errors?.androidPackageName} /></label>
        ) : <input name="android_package_name" type="hidden" value="" />}
        <label><span>Moneda</span><select defaultValue={app?.currency ?? "EUR"} name="currency"><option value="EUR">EUR — Euro</option><option value="USD">USD — Dólar</option><option value="GBP">GBP — Libra</option><option value="MXN">MXN — Peso mexicano</option><option value="ARS">ARS — Peso argentino</option><option value="CLP">CLP — Peso chileno</option><option value="COP">COP — Peso colombiano</option></select></label>
        <label><span>Zona horaria</span><select defaultValue={app?.timezone ?? "Europe/Madrid"} name="timezone">{timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></label>
        <label className="field-span-two"><span>Estado</span><select defaultValue={app?.status ?? "active"} name="status"><option value="active">Activa</option><option value="paused">Pausada</option><option value="disabled">Desactivada</option></select></label>
      </div>

      {state.message ? <p className={state.success ? "form-result form-result-success" : "form-result form-result-error"} role="status">{state.message}</p> : null}
      <div className="management-form-actions">
        <Link href="/dashboard/apps">Cancelar</Link>
        <button disabled={pending} type="submit">{pending ? "Guardando…" : app ? "Guardar cambios" : "Crear app"}</button>
      </div>
    </form>
  );
}
