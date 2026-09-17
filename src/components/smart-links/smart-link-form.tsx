"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { saveSmartLinkAction, type SmartLinkActionState } from "@/app/dashboard/links/actions";
import { slugifySmartLink, smartLinkSourceKinds, smartLinkSourceLabels, type SmartLinkSourceKind } from "@/lib/smart-links/shared";

export type SmartLinkDraft = {
  adExternalId: string;
  adGroupExternalId: string;
  adGroupName: string;
  adName: string;
  affiliate_id: string | null;
  androidUrl: string;
  attribution_window_days: number;
  campaignExternalId: string;
  campaignName: string;
  creator_id: string | null;
  deep_link_path: string | null;
  destination_mode: "android" | "auto" | "ios" | "web";
  id: string;
  iosUrl: string;
  name: string;
  slug: string;
  sourceKind: SmartLinkSourceKind;
  status: "active" | "disabled" | "paused";
  utm_campaign: string | null;
  utm_content: string | null;
  utm_medium: string | null;
  utm_source: string | null;
  utm_term: string | null;
  webUrl: string;
};

const initialState: SmartLinkActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <small className="builder-field-error">{errors[0]}</small> : null;
}

function Help({ children }: { children: ReactNode }) {
  return <small className="builder-help">{children}</small>;
}

export function SmartLinkForm({ appId, draft }: { appId: string; draft?: SmartLinkDraft }) {
  const [state, action, pending] = useActionState(saveSmartLinkAction, initialState);
  const [slug, setSlug] = useState(draft?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(draft));
  const [sourceKind, setSourceKind] = useState<SmartLinkSourceKind>(draft?.sourceKind ?? "google_ads");

  return (
    <form action={action} className="link-builder">
      <input name="app_id" type="hidden" value={appId} />
      <input name="smart_link_id" type="hidden" value={draft?.id ?? ""} />

      <div className="link-builder-heading">
        <div><span>{draft ? "EDITAR ENLACE" : "NUEVO ENLACE"}</span><h2>{draft ? draft.name : "¿De dónde llegará este usuario?"}</h2></div>
        <p>Completa lo que conozcas. Attruvi guardará campaña, anuncio y clic juntos para medir lo que ocurra después.</p>
      </div>

      <section className="builder-section">
        <div className="builder-section-number">01</div>
        <div className="builder-section-content">
          <div><h3>Identifica el enlace</h3><p>El nombre solo lo ves tú. El slug es la parte corta que se comparte.</p></div>
          <div className="builder-grid">
            <label><span>Nombre interno</span><input defaultValue={draft?.name ?? ""} maxLength={160} name="name" onChange={(event) => { if (!slugEdited) setSlug(slugifySmartLink(event.target.value)); }} placeholder="TikTok — vídeo lanzamiento" required /><FieldError errors={state.errors?.name} /></label>
            <label><span>Slug público</span><div className="slug-field"><i>/</i><input maxLength={81} name="slug" onChange={(event) => { setSlugEdited(true); setSlug(slugifySmartLink(event.target.value)); }} placeholder="tiktok-lanzamiento" required value={slug} /></div><FieldError errors={state.errors?.slug} /></label>
            <label><span>Origen</span><select name="source_kind" onChange={(event) => setSourceKind(event.target.value as SmartLinkSourceKind)} value={sourceKind}>{smartLinkSourceKinds.map((kind) => <option key={kind} value={kind}>{smartLinkSourceLabels[kind]}</option>)}</select></label>
            <label><span>Estado</span><select defaultValue={draft?.status ?? "active"} name="status"><option value="active">Activo</option><option value="paused">Pausado</option><option value="disabled">Desactivado</option></select></label>
            {sourceKind === "affiliate" ? <label className="field-span-two"><span>ID del afiliado (opcional)</span><input defaultValue={draft?.affiliate_id ?? ""} name="affiliate_id" placeholder="afiliado-123" /></label> : <input name="affiliate_id" type="hidden" value="" />}
            {sourceKind === "influencer" ? <label className="field-span-two"><span>ID del creador (opcional)</span><input defaultValue={draft?.creator_id ?? ""} name="creator_id" placeholder="creador-123" /></label> : <input name="creator_id" type="hidden" value="" />}
          </div>
        </div>
      </section>

      <section className="builder-section">
        <div className="builder-section-number">02</div>
        <div className="builder-section-content">
          <div><h3>Describe la campaña y el anuncio</h3><p>Estos datos te permitirán comparar después qué creatividad trae mejores compradores.</p></div>
          <div className="builder-grid builder-grid-pairs">
            <label><span>Campaña</span><input defaultValue={draft?.campaignName ?? ""} name="campaign_name" placeholder="Lanzamiento septiembre" /><FieldError errors={state.errors?.campaignName} /></label>
            <label><span>ID de campaña</span><input defaultValue={draft?.campaignExternalId ?? ""} name="campaign_external_id" placeholder="Opcional" /></label>
            <label><span>Grupo de anuncios</span><input defaultValue={draft?.adGroupName ?? ""} name="ad_group_name" placeholder="España — iOS" /><FieldError errors={state.errors?.adGroupName} /></label>
            <label><span>ID del grupo</span><input defaultValue={draft?.adGroupExternalId ?? ""} name="ad_group_external_id" placeholder="Opcional" /></label>
            <label><span>Anuncio concreto</span><input defaultValue={draft?.adName ?? ""} name="ad_name" placeholder="Vídeo 03" /><FieldError errors={state.errors?.adName} /></label>
            <label><span>ID del anuncio</span><input defaultValue={draft?.adExternalId ?? ""} name="ad_external_id" placeholder="Opcional" /></label>
          </div>
        </div>
      </section>

      <section className="builder-section">
        <div className="builder-section-number">03</div>
        <div className="builder-section-content">
          <div><h3>Elige adónde enviarlo</h3><p>Si la app ya está instalada, iOS o Android pueden abrirla directamente. Si no, se abre la tienda sin mostrar una página intermedia.</p></div>
          <div className="builder-grid">
            <label className="field-span-two"><span>Comportamiento</span><select defaultValue={draft?.destination_mode ?? "auto"} name="destination_mode"><option value="auto">Detectar iOS, Android o web automáticamente</option><option value="ios">Enviar siempre a App Store</option><option value="android">Enviar siempre a Google Play</option><option value="web">Enviar siempre a la web</option></select></label>
            <label><span>URL de App Store</span><input defaultValue={draft?.iosUrl ?? ""} inputMode="url" name="ios_url" placeholder="https://apps.apple.com/…" /><FieldError errors={state.errors?.iosUrl} /></label>
            <label><span>URL de Google Play</span><input defaultValue={draft?.androidUrl ?? ""} inputMode="url" name="android_url" placeholder="https://play.google.com/store/apps/…" /><FieldError errors={state.errors?.androidUrl} /></label>
            <label className="field-span-two"><span>Web de respaldo</span><input defaultValue={draft?.webUrl ?? ""} inputMode="url" name="web_url" placeholder="https://tuapp.com" required /><Help>Se usa en ordenadores o cuando una tienda no está configurada.</Help><FieldError errors={state.errors?.webUrl} /></label>
            <label><span>Ruta dentro de la app (opcional)</span><input defaultValue={draft?.deep_link_path ?? ""} name="deep_link_path" placeholder="/oferta/verano" /><FieldError errors={state.errors?.deepLinkPath} /></label>
            <label><span>Ventana de atribución</span><select defaultValue={String(draft?.attribution_window_days ?? 7)} name="attribution_window_days"><option value="1">1 día</option><option value="7">7 días</option><option value="14">14 días</option><option value="30">30 días</option><option value="60">60 días</option><option value="90">90 días</option></select></label>
          </div>
        </div>
      </section>

      <details className="builder-advanced">
        <summary>Parámetros UTM avanzados</summary>
        <p>Son etiquetas que también reconocerán tus herramientas de analítica. Puedes dejarlas vacías.</p>
        <div className="builder-grid">
          <label><span>utm_source</span><input defaultValue={draft?.utm_source ?? ""} name="utm_source" placeholder="tiktok" /></label>
          <label><span>utm_medium</span><input defaultValue={draft?.utm_medium ?? ""} name="utm_medium" placeholder="paid_social" /></label>
          <label><span>utm_campaign</span><input defaultValue={draft?.utm_campaign ?? ""} name="utm_campaign" placeholder="lanzamiento" /></label>
          <label><span>utm_content</span><input defaultValue={draft?.utm_content ?? ""} name="utm_content" placeholder="video-03" /></label>
          <label className="field-span-two"><span>utm_term</span><input defaultValue={draft?.utm_term ?? ""} name="utm_term" placeholder="Opcional" /></label>
        </div>
      </details>

      {state.message ? <p className={state.success ? "form-result form-result-success" : "form-result form-result-error"} role="status">{state.message}</p> : null}
      <div className="management-form-actions link-builder-actions"><Link href={`/dashboard/links?app=${appId}`}>Cancelar</Link><button disabled={pending} type="submit">{pending ? "Guardando…" : draft ? "Guardar cambios" : "Crear enlace inteligente"}</button></div>
    </form>
  );
}
