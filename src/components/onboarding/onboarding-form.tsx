"use client";

import { useActionState, useState } from "react";
import {
  submitOnboarding,
  type OnboardingActionState,
} from "@/app/onboarding/actions";

type Draft = {
  android_package_name?: string;
  app_name?: string;
  currency?: string;
  ios_bundle_id?: string;
  platform?: "android" | "both" | "ios";
  project_name?: string;
  timezone?: string;
};

const initialState: OnboardingActionState = {};

const timezones = [
  "Europe/Madrid",
  "UTC",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/New_York",
];

export function OnboardingForm({ draft }: { draft: Draft }) {
  const [state, action, pending] = useActionState(
    submitOnboarding,
    initialState,
  );
  const [platform, setPlatform] = useState(draft.platform ?? "both");

  return (
    <form action={action} className="onboarding-form">
      <div className="onboarding-form-section">
        <div className="onboarding-step-number">01</div>
        <div className="onboarding-fields">
          <div className="onboarding-section-heading">
            <h2>Tu proyecto</h2>
            <p>Es el espacio que agrupará tus apps, usuarios y métricas.</p>
          </div>
          <label>
            <span>Nombre del proyecto</span>
            <input
              defaultValue={draft.project_name ?? ""}
              maxLength={120}
              name="project_name"
              placeholder="Por ejemplo, Mis aplicaciones"
              required
            />
            {state.errors?.projectName ? <small>{state.errors.projectName[0]}</small> : null}
          </label>
        </div>
      </div>

      <div className="onboarding-form-section">
        <div className="onboarding-step-number">02</div>
        <div className="onboarding-fields">
          <div className="onboarding-section-heading">
            <h2>Tu primera app</h2>
            <p>Añade solo lo que ya aparece en tu proyecto React Native.</p>
          </div>
          <label>
            <span>Nombre de la app</span>
            <input
              defaultValue={draft.app_name ?? ""}
              maxLength={120}
              name="app_name"
              placeholder="Por ejemplo, Mi aplicación"
              required
            />
            {state.errors?.appName ? <small>{state.errors.appName[0]}</small> : null}
          </label>
          <fieldset className="platform-picker">
            <legend>Plataformas</legend>
            {[
              ["ios", "iOS"],
              ["android", "Android"],
              ["both", "Ambas"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  checked={platform === value}
                  name="platform"
                  onChange={() => setPlatform(value as typeof platform)}
                  type="radio"
                  value={value}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {(platform === "ios" || platform === "both") ? (
            <label>
              <span>Bundle ID de iOS</span>
              <input
                defaultValue={draft.ios_bundle_id ?? ""}
                name="ios_bundle_id"
                placeholder="com.empresa.app"
                required
              />
              <em>Lo encontrarás en Xcode o en app.json.</em>
              {state.errors?.iosBundleId ? <small>{state.errors.iosBundleId[0]}</small> : null}
            </label>
          ) : <input name="ios_bundle_id" type="hidden" value="" />}
          {(platform === "android" || platform === "both") ? (
            <label>
              <span>Package name de Android</span>
              <input
                defaultValue={draft.android_package_name ?? ""}
                name="android_package_name"
                placeholder="com.empresa.app"
                required
              />
              <em>Lo encontrarás en android/app/build.gradle.</em>
              {state.errors?.androidPackageName ? <small>{state.errors.androidPackageName[0]}</small> : null}
            </label>
          ) : <input name="android_package_name" type="hidden" value="" />}
        </div>
      </div>

      <div className="onboarding-form-section">
        <div className="onboarding-step-number">03</div>
        <div className="onboarding-fields onboarding-fields-two-columns">
          <div className="onboarding-section-heading onboarding-span-two">
            <h2>Cómo quieres ver los datos</h2>
            <p>Usaremos estos valores para agrupar días y mostrar ingresos.</p>
          </div>
          <label>
            <span>Moneda</span>
            <select defaultValue={draft.currency ?? "EUR"} name="currency">
              <option value="EUR">EUR — Euro</option>
              <option value="USD">USD — Dólar estadounidense</option>
              <option value="GBP">GBP — Libra esterlina</option>
              <option value="MXN">MXN — Peso mexicano</option>
              <option value="ARS">ARS — Peso argentino</option>
              <option value="CLP">CLP — Peso chileno</option>
              <option value="COP">COP — Peso colombiano</option>
            </select>
          </label>
          <label>
            <span>Zona horaria</span>
            <select defaultValue={draft.timezone ?? "Europe/Madrid"} name="timezone">
              {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
            </select>
            {state.errors?.timezone ? <small>{state.errors.timezone[0]}</small> : null}
          </label>
        </div>
      </div>

      {state.message ? <p className="onboarding-message" role="alert">{state.message}</p> : null}

      <div className="onboarding-actions">
        <button className="onboarding-save" disabled={pending} formNoValidate name="intent" type="submit" value="save">
          Guardar y continuar después
        </button>
        <button className="onboarding-complete" disabled={pending} name="intent" type="submit" value="complete">
          {pending ? "Guardando…" : "Crear mi panel"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
