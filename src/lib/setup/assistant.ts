export const ATTRUVI_SDK_VERSION = "0.1.0";

export type SetupPlatform = {
  androidPackageName: string | null;
  iosBundleId: string | null;
  platform: "android" | "ios";
};

export type SetupApp = {
  currency: string;
  id: string;
  name: string;
  organizationName: string;
  slug: string;
  timezone: string;
};

export type SetupStepState = "complete" | "current" | "pending";

export type SetupFacts = {
  associationReady: boolean;
  connectedNetworks: number;
  debugStages: ReadonlySet<string>;
  eventNames: ReadonlySet<string>;
  hasActiveDevelopmentKey: boolean;
  hasActiveSmartLink: boolean;
  hasRealSdkInstallation: boolean;
  platforms: readonly SetupPlatform[];
};

export type SetupStep = {
  description: string;
  id: number;
  state: SetupStepState;
  title: string;
};

const stepCopy = [
  ["Datos de iOS y Android", "Comprueba los identificadores que Apple y Google usan para reconocer tu app."],
  ["Clave pública del SDK", "Crea la appKey de development. Puedes rotarla si deja de estar bajo tu control."],
  ["Instalar el SDK", "Añade @attruvi/react-native y confirma la primera señal enviada por tu app."],
  ["Enlaces que abren la app", "Configura Universal Links y App Links sin una pantalla de redirección."],
  ["Eventos que generan valor", "Registra sign_up, purchase y subscription_started con importes fiables."],
  ["Enlace de prueba", "Crea un enlace inteligente y úsalo para comprobar el recorrido real."],
  ["Comprobación en vivo", "Observa clic, primera apertura, atribución, evento, cola y postback simulado."],
  ["Redes publicitarias", "Conecta Google Ads, Meta Ads y TikTok Ads cuando tengas sus credenciales."],
] as const;

export function deriveSetupSteps(facts: SetupFacts): SetupStep[] {
  const completed = [
    facts.platforms.length > 0,
    facts.hasActiveDevelopmentKey,
    facts.hasRealSdkInstallation,
    facts.associationReady,
    ["sign_up", "purchase", "subscription_started"].every((name) => facts.eventNames.has(name)),
    facts.hasActiveSmartLink,
    ["click", "first_open", "event"].every((stage) => facts.debugStages.has(stage)),
    facts.connectedNetworks > 0,
  ];
  const firstIncomplete = completed.findIndex((value) => !value);
  return stepCopy.map(([title, description], index) => ({
    description,
    id: index + 1,
    state: completed[index] ? "complete" : index === firstIncomplete ? "current" : "pending",
    title,
  }));
}

function platformDetails(platforms: readonly SetupPlatform[]) {
  const ios = platforms.find((platform) => platform.platform === "ios")?.iosBundleId;
  const android = platforms.find((platform) => platform.platform === "android")?.androidPackageName;
  return {
    android: android ?? "NO CONFIGURADO",
    ios: ios ?? "NO CONFIGURADO",
  };
}

export function buildSetupAiPrompt(input: {
  app: SetupApp;
  endpoint: string;
  linkDomain: string;
  platforms: readonly SetupPlatform[];
  publicAppKey?: string;
  step?: number;
}) {
  const identifiers = platformDetails(input.platforms);
  const appKey = input.publicAppKey ?? "PEGA_AQUI_LA_APPKEY_PUBLICA_QUE_MUESTRA_ATTRUVI";
  const focus = input.step
    ? `Concéntrate primero en el paso ${input.step}: ${stepCopy[input.step - 1]?.[0] ?? "configuración"}.`
    : "Completa todos los pasos en orden y detente únicamente si falta un dato de Apple o Google que no pueda deducirse del repositorio.";
  return `Trabaja en mi aplicación React Native “${input.app.name}” y configura Attruvi de forma real. ${focus}

Datos públicos de esta app:
- iOS bundle id: ${identifiers.ios}
- Android package name: ${identifiers.android}
- appKey pública de development: ${appKey}
- endpoint de ingestión: ${input.endpoint}
- dominio de enlaces: ${input.linkDomain}
- moneda: ${input.app.currency}
- zona horaria: ${input.app.timezone}

Antes de cambiar nada, detecta si el proyecto es React Native bare o Expo. Comprueba package.json, la versión de React Native y si usa New Architecture. Instala @attruvi/react-native y @react-native-async-storage/async-storage. Si es Expo usa una development build con prebuild; no prometas Expo Go.

Archivos que espero que revises o crees cuando existan en el proyecto:
- package.json y el archivo raíz App.tsx, src/App.tsx o app/_layout.tsx.
- AndroidManifest.xml, android/app/build.gradle y MainActivity.kt.
- ios/<NOMBRE_APP>/Info.plist, ios/<NOMBRE_APP>/<NOMBRE_APP>.entitlements y AppDelegate.swift.

Inicializa Attruvi una sola vez con environment “development”, consentimiento explícito y la appKey pública anterior. Configura Universal Links/App Links para ${input.linkDomain}. Añade sign_up, purchase y subscription_started: purchase y suscripciones deben usar transactionId estable, valueMinor entero y currency ISO. No envíes correo, teléfono, nombre, dirección ni otros datos personales.

No añadas claves privadas de Supabase, Cloudflare, Google, Meta, TikTok ni Apple. No inventes Team ID, SHA-256 del certificado o credenciales: si faltan, indica exactamente dónde pegarlas. Ejecuta typecheck, tests y una compilación nativa disponible. Al final enumera archivos cambiados, pruebas y los pasos externos que todavía faltan.`;
}

export function buildSetupMarkdown(input: {
  app: SetupApp;
  endpoint: string;
  linkDomain: string;
  platforms: readonly SetupPlatform[];
}) {
  const identifiers = platformDetails(input.platforms);
  const prompt = buildSetupAiPrompt(input);
  return `# ATTRUVI_SETUP — ${input.app.name}

Esta guía no contiene secretos. La appKey es un identificador público y se muestra una sola vez al crearla en Attruvi.

## Datos de la app

- Bundle ID de iOS: \`${identifiers.ios}\`
- Package name de Android: \`${identifiers.android}\`
- Endpoint: \`${input.endpoint}\`
- Dominio de enlaces: \`${input.linkDomain}\`
- Moneda: \`${input.app.currency}\`
- Zona horaria: \`${input.app.timezone}\`

## React Native bare

\`\`\`bash
npm install @attruvi/react-native @react-native-async-storage/async-storage
cd ios && bundle exec pod install
\`\`\`

Inicializa el SDK una sola vez en la raíz de la app:

\`\`\`ts
import { Attruvi } from "@attruvi/react-native";

await Attruvi.initialize({
  appKey: "PEGA_AQUI_LA_APPKEY_PUBLICA",
  endpoint: "${input.endpoint}",
  environment: "development",
  consent: "granted",
});
\`\`\`

## Expo development build

Expo 57 / React Native 0.86.3 se ha auditado para las apps objetivo, pero necesita módulos nativos. No funciona en Expo Go.

\`\`\`bash
npm install @attruvi/react-native @react-native-async-storage/async-storage
npx expo prebuild
npx expo run:android
# o npx expo run:ios
\`\`\`

## Eventos mínimos

\`\`\`ts
await Attruvi.track("sign_up");
await Attruvi.track("purchase", {
  transactionId: purchase.id,
  valueMinor: 4990,
  currency: "${input.app.currency}",
});
await Attruvi.track("subscription_started", {
  transactionId: transaction.id,
  subscriptionId: subscription.id,
  productId: "premium-monthly",
  valueMinor: 999,
  currency: "${input.app.currency}",
});
\`\`\`

## Hazlo con Codex, ChatGPT o Claude

\`\`\`text
${prompt}
\`\`\`

## Validación

Vuelve a **Configurar** en el dashboard. El diagnóstico comprobará identificadores, dominio, AASA/assetlinks, endpoint, versión del SDK y último evento. Usa siempre development para las pruebas: Attruvi nunca envía esos postbacks a una red real.
`;
}
