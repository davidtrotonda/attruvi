# Despliegue propio

Esta guía describe la arquitectura; no contiene IDs ni secretos reales.

## Requisitos

- Node.js compatible con `package.json` y npm workspaces;
- proyecto Supabase con Auth y Postgres;
- proyecto Vercel para Next.js;
- cuenta Cloudflare con dos Workers, KV y Queues;
- dominios propios para web, enlaces e ingestión.

## Orden reproducible

1. Copia `.env.example` a un archivo local ignorado y completa los valores. Mantén `ATTRUVI_REQUIRE_PLATFORM_ENV=true` en producción.
2. Aplica `supabase/migrations` en orden y carga `supabase/seed.sql` solo en un entorno demo.
3. Configura Auth siguiendo `docs/AUTH_SETUP.md`. Las URLs deben coincidir exactamente con tu dominio.
4. Genera `CONNECTOR_ENCRYPTION_KEYS` como un JSON de versiones y claves aleatorias de 32 bytes; conserva versiones anteriores mientras existan ciphertexts con ellas.
5. Crea los recursos Cloudflare y carga los secretos con `wrangler secret put`; nunca los añadas a `wrangler.jsonc`.
6. Configura AASA/assetlinks con los identificadores y certificados reales de tus apps.
7. Añade las variables a Vercel como secretos separados por entorno y despliega.
8. Ejecuta `npm run verify`, `npm run security:check`, pruebas pgTAP y el diagnóstico del asistente antes de enviar eventos reales.

La appKey del SDK es pública, revocable y limitada a una app/entorno; no la sustituyas por una clave de servicio. Los tokens OAuth solo pertenecen a Next.js/Workers. Consulta `docs/SECURITY_AUDIT.md` y `docs/THREAT_MODEL.md` antes de producción.
