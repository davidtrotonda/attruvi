# @attruvi/react-native

SDK abierto de Attruvi para relacionar instalaciones, sesiones, registros, compras y suscripciones con el anuncio o enlace que originó al usuario.

## Compatibilidad

| Aplicación auditada | Base | Arquitectura | Estado del SDK |
|---|---|---|---|
| Tourixy | React Native 0.87.0, React 19.2.8, Hermes | New Architecture | Android compilado en piloto aislado |
| Solsuna | Expo 57, React Native 0.86.3 | New Architecture | Android compilado desde tarball local |
| Rutimon | Expo 57, React Native 0.86.3 | New Architecture | Android compilado desde tarball local |

El peer range inicial es `react-native >=0.86.3 <0.88`, definido y construido contra las apps objetivo. iOS sigue pendiente de compilación en macOS/Xcode. Consulta [`docs/APP_COMPATIBILITY.md`](../../docs/APP_COMPATIBILITY.md) para ver referencias, comandos, artefactos y límites exactos.

## Instalación para personas

```bash
npm install @attruvi/react-native @react-native-async-storage/async-storage
```

En iOS instala los pods después de añadir el paquete:

```bash
cd ios
bundle exec pod install
```

En Expo debes crear una **development build** después de instalarlo:

```bash
npx expo prebuild
npx expo run:android
# o: npx expo run:ios
```

No funciona en Expo Go: el almacenamiento seguro y Play Install Referrer necesitan código nativo que Expo Go no incorpora.

### Inicialización

Hazlo una sola vez cerca de la raíz de la app, cuando ya conozcas el consentimiento del usuario:

```ts
import { Attruvi } from "@attruvi/react-native";

await Attruvi.initialize({
  appKey: "attruvi_live_TU_CLAVE_PUBLICA",
  endpoint: "https://ingest.attruvi.com",
  environment: "production",
  consent: "granted",
  purposes: {
    analytics: true,
    attribution: true,
    advertising: false, // Actívalo solo con una base legal válida para postbacks.
    personalization: false,
  },
  propertyAllowlist: {
    all: ["screen"],
    events: {
      purchase: ["transactionId", "valueMinor", "currency", "productId"],
      subscription_started: [
        "transactionId",
        "valueMinor",
        "currency",
        "productId",
        "subscriptionId",
      ],
    },
    traits: ["plan"],
  },
});
```

`appKey` identifica públicamente la app y puede revocarse. No pegues claves secretas de Supabase, Google, Meta, TikTok o Cloudflare en la aplicación.

### Eventos

```ts
await Attruvi.track("sign_up");

await Attruvi.track("purchase", {
  transactionId: purchase.id,
  valueMinor: 4990,
  currency: "EUR",
  productId: "tour-premium",
});

await Attruvi.track("subscription_started", {
  transactionId: transaction.id,
  valueMinor: 999,
  currency: "EUR",
  productId: "premium-monthly",
  subscriptionId: subscription.id,
});
```

El SDK crea `install`, `app_open` y `session_start` automáticamente. `valueMinor` siempre es un entero en la unidad menor de la moneda: `4990` equivale a 49,90 EUR.

### Identidad y consentimiento

```ts
await Attruvi.identify(user.id, { plan: "premium" });
await Attruvi.resetIdentity();
await Attruvi.setConsent("denied");
```

Usa un ID interno opaco en `identify`; el SDK rechaza correos y teléfonos como `userId`. Con consentimiento `unknown` o `denied` no crea identificadores ni encola eventos. Al denegarlo borra cola, identidad y atribución locales.

Attruvi no lee IDFA ni AAID y no solicita ATT. Si otra parte de tu app usa identificadores publicitarios, esa recogida debe tener su propio consentimiento y justificación.

### Atribución

```ts
const unsubscribe = Attruvi.onAttributionChanged(attribution => {
  console.log(attribution?.source, attribution?.campaign, attribution?.adId);
});

const current = await Attruvi.getAttribution();
unsubscribe();
```

El SDK escucha Universal Links/App Links y, en Android, Play Install Referrer. Solo conserva parámetros conocidos de Attruvi, UTM y señales oficiales de Google, Meta y TikTok.

Configura tus dominios asociados en la app:

- iOS: añade `applinks:links.attruvi.com` a Associated Domains y publica `apple-app-site-association`.
- Android: añade un `intent-filter` HTTPS verificado para `links.attruvi.com` y publica `assetlinks.json`.

### Entrega y modo offline

La cola se persiste con AsyncStorage, está limitada a 1.000 eventos o 2 MB y envía lotes de hasta 100. Cada evento conserva el mismo `eventId` e `idempotencyKey` durante todos los reintentos. El backoff exponencial usa jitter y nunca borra un lote por un fallo de red. Puedes solicitar un intento inmediato con:

```ts
const result = await Attruvi.flush();
```

Los identificadores y la identidad se guardan en Keychain en iOS y EncryptedSharedPreferences en Android. Los logs del SDK solo se emiten cuando `__DEV__` es verdadero.

## API pública

- `Attruvi.initialize({ appKey, endpoint, environment, consent, ... })`
- `Attruvi.track(name, properties?, options?)`
- `Attruvi.identify(userId, traits?)`
- `Attruvi.resetIdentity()`
- `Attruvi.setConsent(state)`
- `Attruvi.getAttribution()`
- `Attruvi.flush()`
- `Attruvi.onAttributionChanged(listener)`

## Pega esto en Codex/ChatGPT/Claude

```text
Instala @attruvi/react-native y @react-native-async-storage/async-storage en esta app. Comprueba primero su versión de React Native y si usa Expo. Si usa Expo, prepara una development build; no prometas Expo Go. Configura autolinking, pods en iOS y los Universal Links/App Links del dominio de Attruvi. Inicializa el SDK una sola vez con la appKey pública y el endpoint que te doy, nunca con secretos. Respeta el consentimiento existente de la app. Añade sign_up, purchase y los eventos de suscripción usando valueMinor entero, currency ISO y transactionId estable. Ejecuta typecheck y una compilación nativa de la plataforma disponible, y dime exactamente qué falta configurar en Apple/Google.
```

## Desarrollo del paquete

```bash
npm run typecheck -w @attruvi/react-native
npm run test -w @attruvi/react-native
npm run build -w @attruvi/react-native
npm run pack:check -w @attruvi/react-native
```

Licencia MIT.
