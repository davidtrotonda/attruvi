import Link from "next/link";
import type { CSSProperties } from "react";
import { CopyButton } from "@/components/setup/copy-button";
import { LiveDebugger } from "@/components/setup/live-debugger";
import { SdkKeyControl } from "@/components/setup/sdk-key-control";
import { TestEventControl } from "@/components/setup/test-event-control";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { dashboardHref, parseDashboardFilters, type DashboardSearchParams } from "@/lib/dashboard/filters";
import { formatDateTime, shortOpaqueId } from "@/lib/dashboard/format";
import { getSetupAssistant } from "@/lib/data/setup";
import type { SetupStep } from "@/lib/setup/assistant";

const stateLabels = { complete: "Listo", current: "Siguiente", pending: "Pendiente" } as const;
const stageLabels: Record<string, string> = {
  attribution: "Atribución",
  click: "Clic",
  event: "Evento",
  first_open: "Primera apertura",
  postback: "Postback",
  queue: "Cola",
  validation: "Validación",
};

function AiSection({ prompt }: { prompt: string }) {
  return <details className="setup-ai-section"><summary><span aria-hidden="true">✦</span> Hazlo con IA</summary><div><p>Copia este encargo en Codex, ChatGPT o Claude. Ya incluye los datos públicos de esta app.</p><pre><code>{prompt}</code></pre><CopyButton label="Copiar prompt" text={prompt} /></div></details>;
}

function StepHeading({ step }: { step: SetupStep }) {
  return <header className="setup-step-heading"><span className={`setup-step-number setup-step-${step.state}`}>{step.state === "complete" ? "✓" : String(step.id).padStart(2, "0")}</span><div><small>PASO {String(step.id).padStart(2, "0")}</small><h2>{step.title}</h2><p>{step.description}</p></div><span className={`setup-state setup-state-${step.state}`}>{stateLabels[step.state]}</span></header>;
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const setup = await getSetupAssistant(identity, filters);
  if (!setup.selectedApp) return <div className="management-empty"><span aria-hidden="true">✦</span><h2>Primero crea una app</h2><p>El asistente se adapta a los identificadores reales de cada aplicación.</p><Link className="management-primary-link" href="/onboarding">Crear mi primera app</Link></div>;

  const app = setup.selectedApp;
  const canConfigure = setup.role === "owner" || setup.role === "admin";
  const completed = setup.steps.filter((step) => step.state === "complete").length;
  const linkHost = new URL(setup.linkBaseUrl).host;
  const androidPackage = setup.platforms.find((platform) => platform.platform === "android")?.androidPackageName;
  const iosBundle = setup.platforms.find((platform) => platform.platform === "ios")?.iosBundleId;
  const downloadHref = dashboardHref("/api/private/apps/setup-file", { app: app.slug, workspace: app.organizationSlug });
  const editHref = `/dashboard/apps?workspace=${encodeURIComponent(app.organizationSlug)}&app=${encodeURIComponent(app.slug)}&edit=${app.id}`;
  const linksHref = dashboardHref("/dashboard/links", { app: app.slug, environment: "development", workspace: app.organizationSlug });
  const newLinkHref = `${linksHref}&new=1`;
  const integrationsHref = dashboardHref("/dashboard/integrations", { app: app.slug, environment: "development", workspace: app.organizationSlug });
  const initializeSnippet = `import { Attruvi } from "@attruvi/react-native";

await Attruvi.initialize({
  appKey: "PEGA_AQUI_LA_APPKEY_PUBLICA",
  endpoint: "${setup.ingestEndpoint}",
  environment: "development",
  consent: "granted",
});`;
  const eventSnippet = `await Attruvi.track("sign_up");

await Attruvi.track("purchase", {
  transactionId: purchase.id,
  valueMinor: 4990,
  currency: "${app.currency}",
});

await Attruvi.track("subscription_started", {
  transactionId: transaction.id,
  subscriptionId: subscription.id,
  productId: "premium-monthly",
  valueMinor: 999,
  currency: "${app.currency}",
});`;

  return <>
    <div className="management-heading setup-page-heading">
      <div><p className="dashboard-eyebrow">CONFIGURACIÓN GUIADA · DEVELOPMENT</p><h1>Instala Attruvi en {app.name}.</h1><p>Ocho pasos claros, comprobación automática y prompts preparados para trabajar con IA.</p></div>
      <div className="setup-heading-actions"><div className="setup-progress-ring" style={{ "--setup-progress": `${completed / setup.steps.length * 360}deg` } as CSSProperties}><strong>{completed}/{setup.steps.length}</strong><span>listos</span></div><a className="management-primary-link setup-download" download="ATTRUVI_SETUP.md" href={downloadHref}>Descargar guía</a></div>
    </div>

    <nav aria-label="Pasos de configuración" className="setup-step-nav">{setup.steps.map((step) => <a className={`setup-nav-${step.state}`} href={`#paso-${step.id}`} key={step.id}><span>{step.state === "complete" ? "✓" : step.id}</span><small>{step.title}</small></a>)}</nav>

    {!canConfigure ? <div className="permission-banner"><span aria-hidden="true">◉</span><div><strong>Acceso de solo lectura</strong><p>Puedes seguir la guía y copiar prompts, pero solo un owner o admin puede crear claves o enviar pruebas.</p></div></div> : null}

    <section className="setup-steps">
      <article className="setup-step-card" id="paso-1"><StepHeading step={setup.steps[0]} /><div className="setup-step-body"><div className="setup-platform-grid">
        <div><span>iOS · BUNDLE ID</span><strong>{iosBundle ?? "Sin configurar"}</strong><small>{iosBundle ? "Se usará para AASA y Associated Domains." : "Añádelo para medir instalaciones de iPhone."}</small></div>
        <div><span>ANDROID · PACKAGE NAME</span><strong>{androidPackage ?? "Sin configurar"}</strong><small>{androidPackage ? "Se usará para assetlinks y Play Install Referrer." : "Añádelo para medir instalaciones de Android."}</small></div>
      </div><Link className="setup-secondary-link" href={editHref}>Editar datos de la app</Link></div><AiSection prompt={setup.prompts[0]} /></article>

      <article className="setup-step-card" id="paso-2"><StepHeading step={setup.steps[1]} /><div className="setup-step-body"><p>La clave pública permite que el Worker sepa qué app envía un evento. Está limitada a <strong>development</strong>, se puede revocar y nunca permite consultar métricas.</p><SdkKeyControl appId={app.id} canConfigure={canConfigure} hasActiveKey={Boolean(setup.activeDevelopmentKey)} visiblePrefix={setup.activeDevelopmentKey?.visible_prefix} /></div><AiSection prompt={setup.prompts[1]} /></article>

      <article className="setup-step-card" id="paso-3"><StepHeading step={setup.steps[2]} /><div className="setup-step-body"><div className="setup-code-tabs"><div><span>REACT NATIVE BARE</span><pre><code>npm install @attruvi/react-native @react-native-async-storage/async-storage{"\n"}cd ios &amp;&amp; bundle exec pod install</code></pre></div><div><span>EXPO DEVELOPMENT BUILD</span><pre><code>npm install @attruvi/react-native @react-native-async-storage/async-storage{"\n"}npx expo prebuild{"\n"}npx expo run:android</code></pre><small>Auditado para Expo 57 / RN 0.86.3. Requiere development build; no funciona en Expo Go.</small></div></div><div className="setup-snippet"><pre><code>{initializeSnippet}</code></pre><CopyButton text={initializeSnippet} /></div></div><AiSection prompt={setup.prompts[2]} /></article>

      <article className="setup-step-card" id="paso-4"><StepHeading step={setup.steps[3]} /><div className="setup-step-body"><p>Estos ajustes hacen que <code>https://{linkHost}/…</code> abra la app directamente cuando esté instalada. Si no, el Worker responde con un redirect HTTP a la tienda.</p><div className="setup-association-grid"><div><span>iOS · Associated Domains</span><pre><code>{`applinks:${linkHost}`}</code></pre><small>Archivo esperado: <code>ios/&lt;App&gt;/&lt;App&gt;.entitlements</code></small></div><div><span>Android · intent-filter</span><pre><code>{`<data android:scheme="https"\n      android:host="${linkHost}" />`}</code></pre><small>Archivo esperado: <code>android/app/src/main/AndroidManifest.xml</code></small></div></div></div><AiSection prompt={setup.prompts[3]} /></article>

      <article className="setup-step-card" id="paso-5"><StepHeading step={setup.steps[4]} /><div className="setup-step-body"><p>Usa identificadores estables del pedido; el dinero siempre va como entero en unidades menores. Attruvi elimina duplicados por transacción.</p><div className="setup-snippet"><pre><code>{eventSnippet}</code></pre><CopyButton text={eventSnippet} /></div></div><AiSection prompt={setup.prompts[4]} /></article>

      <article className="setup-step-card" id="paso-6"><StepHeading step={setup.steps[5]} /><div className="setup-step-body">{setup.activeLink ? <div className="setup-link-ready"><span>ENLACE ACTIVO</span><strong>{setup.activeLink.name}</strong><code>{setup.linkBaseUrl}/{setup.activeLink.slug}</code><div><a href={`${setup.linkBaseUrl}/${setup.activeLink.slug}?attruvi_test=1`} rel="noreferrer" target="_blank">Abrir prueba ↗</a><Link href={linksHref}>Ver enlaces</Link></div></div> : <div className="setup-empty-action"><span aria-hidden="true">↗</span><div><strong>Crea el primer enlace</strong><p>Elige una tienda o fallback web y usa el modo de prueba para no mezclar este clic con producción.</p></div><Link href={newLinkHref}>Crear enlace de prueba</Link></div>}</div><AiSection prompt={setup.prompts[5]} /></article>

      <article className="setup-step-card" id="paso-7"><StepHeading step={setup.steps[6]} /><div className="setup-step-body"><p>La simulación recorre la ingestión y el modelo real, pero crea una instalación anónima en development. Los postbacks quedan en <strong>dry-run</strong> y nunca contactan a Google, Meta o TikTok.</p><TestEventControl appId={app.id} canConfigure={canConfigure} hasDevelopmentKey={Boolean(setup.activeDevelopmentKey)} /><LiveDebugger>{setup.debugEvents.length ? <ol className="setup-debug-list">{setup.debugEvents.map((event) => <li key={event.id}><span className={`debug-stage debug-stage-${event.status}`}>{stageLabels[event.stage] ?? event.stage}</span><div><strong>{event.title}</strong><p>{event.detail}</p><small>{formatDateTime(event.occurred_at, app.timezone)}{event.request_id ? ` · solicitud ${shortOpaqueId(event.request_id)}` : ""}</small></div></li>)}</ol> : <div className="setup-debug-empty"><span>◎</span><strong>Esperando la primera señal</strong><p>Abre un enlace de prueba o envía un evento desde este panel.</p></div>}</LiveDebugger></div><AiSection prompt={setup.prompts[6]} /></article>

      <article className="setup-step-card" id="paso-8"><StepHeading step={setup.steps[7]} /><div className="setup-step-body"><div className="setup-network-summary"><div><strong>{setup.connectedNetworks}</strong><span>redes conectadas</span></div><p>Las credenciales se añaden al final. El SDK, los enlaces y el Debugger pueden funcionar antes.</p><Link href={integrationsHref}>Conectar redes</Link></div></div><AiSection prompt={setup.prompts[7]} /></article>
    </section>

    <section className="setup-diagnostics"><div className="cost-section-heading"><div><span>DIAG</span><h2>Diagnóstico automático</h2></div><p>Acciones concretas, sin códigos de error crípticos.</p></div><div className="setup-diagnostic-grid">{setup.diagnostics.map((diagnostic) => <article className={`setup-diagnostic setup-diagnostic-${diagnostic.state}`} key={diagnostic.id}><span aria-hidden="true">{diagnostic.state === "pass" ? "✓" : diagnostic.state === "fail" ? "!" : "•"}</span><div><h3>{diagnostic.title}</h3><p>{diagnostic.detail}</p><small>{diagnostic.action}</small></div></article>)}</div></section>

    <section className="setup-master-prompt"><div><span>✦ PROMPT COMPLETO</span><h2>Deja que tu IA lo instale contigo.</h2><p>Está adaptado a {app.name}, incluye los archivos esperados y no contiene ninguna clave privada.</p></div><pre><code>{setup.aiPrompt}</code></pre><CopyButton label="Copiar prompt completo" text={setup.aiPrompt} /></section>
  </>;
}
