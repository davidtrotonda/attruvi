# Compatibilidad con las aplicaciones objetivo

Última validación: 17-09-2026. Esta matriz separa deliberadamente **inspeccionado**,
**probado con fixture equivalente** y **compilado dentro de la app real**. Un manifiesto
compatible no equivale a una compilación satisfactoria.

Esta lista no es un catálogo de apps de Attruvi ni una precarga para cuentas nuevas. Son repositorios que el propietario autorizó usar como fixtures de compatibilidad. El producto sigue siendo multi-tenant: cada usuario registra una app externa propia e instala en ella el mismo SDK público.

No se modificó ningún checkout ni rama de producción. Los identificadores de paquete,
cuentas, proyectos y firma se comprobaron donde era necesario, pero se omiten de este
documento público. No son secretos criptográficos, aunque tampoco son necesarios para
reproducir la validación.

## Resultado ejecutivo

| Objetivo | Referencia inspeccionada | Combinación | Android | iOS | Estado |
| --- | --- | --- | --- | --- | --- |
| Tourixy | `origin/main` en `3d151dc60ef5a92f5fcbbe71934c18eb2614081f` | React Native 0.87.0 bare, React 19.2.8, New Architecture | App real piloto: PASS | Manifiesto revisado; no compilado | Compatible en Android; iOS pendiente de Xcode |
| Solsuna | `origin/main` en `4369c84c49bd657af17fd9aac2eccdfc143282d6` | Expo SDK 57.0.21, React Native 0.86.3, React 19.2.3 | App real en worktree efímero: PASS | Restricciones revisadas; no compilado | Compatible en Android; iOS pendiente de Xcode |
| Rutimon | línea activa más reciente en `272b1db4d12288ba3e4b336e873cb16f8bb93b94` | Expo SDK 57.0.23, React Native 0.86.3, React 19.2.3 | App real en worktree efímero: PASS | Restricciones revisadas; no compilado | Compatible en Android; iOS pendiente de Xcode |

Expo SDK 57 usa React Native 0.86, Node 22.13 o superior, Android 7/API 24
o superior con compile/target SDK 36 e iOS 16.4 o superior. Se tomó esta matriz
de la [documentación oficial de Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
no de una suposición del proyecto.

## Matriz técnica

### Tourixy

- Arquitectura: aplicación React Native bare con `newArchEnabled=true`, Hermes y
  autolinking de React Native CLI.
- iOS: deployment target 15.1 declarado por Xcode/CocoaPods. Swift 5 y proyecto
  nativo versionado.
- Android: min SDK 24, compile SDK 37 y target SDK 36; Java 17, Kotlin 2.2.0 y
  Gradle 9.4.1 en la combinación probada.
- Navegación: shell nativo que contiene la aplicación web en `react-native-webview`;
  la política propia de URLs decide navegación interna, navegador afiliado y deep links.
- Módulos nativos relevantes: WebView, OneSignal, NetInfo, AsyncStorage, blur,
  safe-area y puentes propios de autenticación, dispositivo, afiliados y splash.
- Build system: npm workspaces, React Native Community CLI, Gradle y CocoaPods.

La integración piloto vive únicamente en la rama local aislada
`codex/attruvi-pilot-20260917`, commit `fd660de0`. Inicializa Attruvi en el arranque
del shell solo en development, mantiene consentimiento inicialmente desconocido,
recibe App/Universal Links, automatiza `install`, `app_open` y sesiones, y usa un
puente con protocolo y allowlist estrictos para:

- aplicar consentimiento explícito;
- ejecutar `identify` después de disponer de una sesión autenticada;
- emitir `sign_up` solo al confirmarse el alta o la verificación de correo;
- limpiar la identidad al cerrar sesión.

No se instrumentaron `purchase` ni suscripciones en Tourixy: la referencia auditada
no contiene un callback autoritativo de StoreKit, Play Billing o RevenueCat. Emitirlos
al pulsar un botón o abrir checkout produciría ingresos falsos. Deben añadirse en el
callback de confirmación real cuando exista.

### Solsuna

- Arquitectura: Expo SDK 57/CNG, React Native 0.86.3 y ruta de New Architecture
  generada por `expo prebuild`; necesita development build y no Expo Go.
- iOS/Android: límites oficiales de SDK 57; el proyecto conserva configuración de
  App/Universal Links y los identificadores reales fuera de esta guía pública.
- Navegación: Expo Router con rutas tipadas y `expo-linking`.
- Módulos nativos relevantes: RevenueCat 10.7.2, OneSignal, Google Sign-In,
  Microsoft Clarity, Skia, cámara, notificaciones, media library y secure store.
- Build system: npm, Expo prebuild/CNG y EAS; Gradle/CocoaPods son generados.

El tarball local debe declararse como dependencia real, no instalarse con
`npm install --no-save`, porque Expo Autolinking obtiene su grafo desde el manifiesto:

```json
{
  "dependencies": {
    "@attruvi/react-native": "file:vendor/attruvi-react-native-0.1.0.tgz"
  }
}
```

Después: `npm ci`, `npm run typecheck`, `npx expo prebuild --platform android
--no-install --clean` y `gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a`.
La guía de integración debe inicializar desde el layout raíz tras restaurar el
consentimiento, identificar después de Supabase Auth y emitir compra/renovación
únicamente desde el resultado confirmado de RevenueCat.

### Rutimon

- Arquitectura: Expo SDK 57/CNG, React Native 0.86.3 y New Architecture mediante
  el proyecto nativo generado; necesita development build y no Expo Go.
- iOS/Android: límites oficiales de SDK 57, con App/Universal Links configurados.
- Navegación: Expo Router 57 con rutas tipadas, React Compiler y `expo-linking`.
- Módulos nativos relevantes: RevenueCat 10.9.1 y Purchases UI, OneSignal,
  Google Mobile Ads, Expo Dev Client, Apple Authentication, secure store y video.
- Build system: npm 11/Node 22.13+, Expo prebuild/CNG y EAS.

La instalación es la misma que Solsuna. El evento `sign_up` debe salir del resultado
confirmado de autenticación. `purchase`, `subscription_started` y
`subscription_renewed` deben salir del resultado autoritativo de RevenueCat; nunca
de la apertura del paywall. La integración de Ads no cambia esta regla. Se preparó y
compiló un worktree efímero, pero no se conservaron cambios en la app.

## Evidencia de compilación

El paquete `@attruvi/react-native@0.1.0` se empaquetó como tarball de 39.058 bytes,
SHA-256 `75e1708c2a8505d75bec9fdde72fa8de0e3dbf08b913a182ef254ccb5ced9387`.
Antes de tocar una app real se instaló en un fixture bare React Native 0.87.0 con
New Architecture. TypeScript, Jest y `assembleDebug` para arm64-v8a pasaron.

La primera compilación reveló un problema real de compatibilidad con RN 0.87:
el módulo Kotlin usaba `currentActivity` fuera del alcance disponible. El SDK se
corrigió para usar `context.currentActivity`; no se parcheó ninguna aplicación.

| Compilación aislada | Pruebas adicionales | Resultado Android | Evidencia APK |
| --- | --- | --- | --- |
| Tourixy real desde `origin/main` | shell: 15 suites/186 tests; web typecheck y tests; ambos typechecks | PASS, 201 tareas, 9m12s | 48.514.971 bytes; SHA-256 `FFDFF49A73779F79A6D6B1BDC4CF89C5194D7A0B7A8DD4B77958D878F929B273` |
| Solsuna real desde `origin/main` | typecheck; Expo prebuild y autolinking explícito | PASS, 587 tareas, 19m18s | 124.391.926 bytes; SHA-256 `C38B006D1C59041855956CFE8EF5BED789CAA27F6BAC2559B5534A4DA412C54D` |
| Rutimon real desde la línea activa | typecheck; Expo prebuild y autolinking explícito | PASS, 577 tareas, 14m03s en el reintento | 107.733.953 bytes; SHA-256 `95E34EF2CC7E003897AA19FB3B6542F93404448A6742265273059EDB245B1EE2` |

Los dos worktrees Expo fueron eliminados tras registrar la evidencia. El piloto de
Tourixy permanece aislado y con commit propio para revisión. Ningún APK se publicó ni
se instaló sobre una versión de producción.

## iOS: alcance exacto

Se revisaron Podspec, deployment targets, entitlements y asociaciones. El Podspec de
Attruvi declara iOS 15.1 y Swift 5.9, compatible en manifiesto con Tourixy; Expo SDK 57
eleva sus aplicaciones a iOS 16.4 o superior. Este host es Windows y no dispone de
Xcode, simulador, `pod install` ni firma Apple. Por tanto:

- **no** se afirma una compilación iOS;
- el siguiente control obligatorio es `pod install`, build de simulator y build de
  dispositivo en macOS/Xcode para cada combinación;
- AASA, Associated Domains y apertura real deben verificarse en dispositivo, porque
  una configuración correcta no demuestra que Apple haya servido la asociación.

## E2E sintético reproducible

`packages/react-native/src/target-app-e2e.test.ts` ejerce el contrato completo sin
usar cuentas ni datos reales:

```text
enlace TikTok ficticio
  → redirect 302 directo a Google Play
  → Install Referrer con click_id/ttclid/campaña/grupo/anuncio
  → primera apertura del SDK
  → install + app_open + session_start
  → identify + sign_up
  → purchase 49,90 EUR
  → coste sintético 10,00 EUR
  → métricas exactas
  → tres decisiones de postback en dry-run
```

Resultados afirmados: 1 instalación, 1 comprador, ingresos 4.990 unidades menores
(49,90 EUR), fuente `tiktok`, campaña/grupo/anuncio correctos, CPI 10,00 EUR, CAC
10,00 EUR y ROAS 4,99. TikTok queda **eligible** mediante validación local sin red;
Google queda **skipped: missing_google_click_id** y Meta queda
**skipped: missing_fbclid**. No se inventa una señal para volverlos elegibles.

Las regresiones cubren cola offline con el mismo `event_id`, reintento y
deduplicación, aislamiento de dos organizaciones, ausencia de identificadores y
tráfico sin consentimiento, y caída temporal de links, ingestión, costes, métricas y
postbacks. El Worker libera su claim de deduplicación si Queue falla, por lo que un
reintento puede persistir el clic en lugar de perderlo silenciosamente.

## Pasos pendientes antes de producción

1. Ejecutar las tres compilaciones iOS en macOS/Xcode y probar Universal Links en
   dispositivo físico.
2. Revisar el piloto Tourixy y decidir el callback de compra autoritativo antes de
   emitir ingresos.
3. Aplicar los cambios guiados a Solsuna y Rutimon en ramas nuevas, nunca sobre sus
   checkouts productivos.
4. Sustituir la appKey pública de development por una emitida para cada app. No
   reutilizarla entre organizaciones ni entornos.
5. Probar con endpoints de development y postbacks dry-run antes de habilitar un
   destino publicitario real.

