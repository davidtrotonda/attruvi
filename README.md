# Attruvi

Attruvi es un proyecto de atribución móvil de código abierto para aplicaciones React Native.

Web: [attruvi.com](https://attruvi.com)

El objetivo es conectar campañas publicitarias con instalaciones, compras, ingresos y retención, y devolver conversiones válidas a Google Ads, Meta Ads y TikTok Ads.

> Estado: primera etapa pública. Todavía no está listo para producción.

## Alcance inicial

- SDK para React Native en iOS y Android.
- Atribución de instalaciones y actividad posterior: sesiones, registro, compras, suscripciones, reembolsos y LTV observado.
- Explorador anonimizado de usuarios con el recorrido clic → instalación → sesiones → ingresos → postbacks.
- Medición de ingresos, ROAS, LTV y retención.
- Dashboard de decisiones con comparación de periodos, jerarquía campaña → grupo → anuncio, estados de calidad de datos, filtros compartibles y gestión de equipos owner/admin/viewer.
- Importación de costes de Google Ads, Meta Ads y TikTok Ads, además de entrada diaria, por rango y CSV.
- Postbacks server-side para Google Ads, Meta Ads y TikTok Ads.
- Despliegue propio y trazabilidad completa de los datos.

## Landing

La web pública está construida con Next.js y se despliega en Vercel.

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Estructura

- La landing Next.js permanece en `src/app` y se despliega en Vercel.
- `packages/core` contiene contratos y validación compartida.
- `packages/react-native` contiene el SDK público instalable `@attruvi/react-native`; su guía incluye instalación humana y un prompt para asistentes de código.
- `packages/connectors` define la interfaz de redes publicitarias.
- `workers/links` y `workers/ingest` son Workers de Cloudflare.
- `supabase` contiene migraciones, seeds y pruebas pgTAP reproducibles.

```bash
npm install
npm run verify
```

La arquitectura y el estado real están en `docs/ARCHITECTURE.md` y `docs/BUILD_STATUS.md`.

La configuración de Supabase Auth, Google OAuth y sus URLs de retorno está en `docs/AUTH_SETUP.md`.

La instalación y compatibilidad del SDK están en `packages/react-native/README.md` y `docs/SDK_COMPATIBILITY.md`.

La API pública del SDK, sus límites, OpenAPI, Cloudflare Queue, DLQ y prueba de carga están en `docs/INGEST_API.md` y `workers/ingest/openapi.yaml`.

El orden de evidencia, la exactitud real por plataforma y la explicación de decisiones están en `docs/ATTRIBUTION.md`.

La configuración, versiones oficiales, seguridad de tokens, sincronización incremental y formato CSV de los costes están en `docs/AD_COST_CONNECTORS.md`.

La elegibilidad, cola outbox, pruebas seguras, reintentos, dead-letter y replay de conversiones están en `docs/POSTBACKS.md`.

Las fórmulas exactas de CPI, CAC, ROAS, retención, conversiones y LTV, junto con cohortes, datos tardíos, reconciliación y benchmark, están en `docs/METRICS.md`.

## Licencia

MIT
