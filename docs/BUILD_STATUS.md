# Estado de construcción

Actualizado: 2026-09-17.

## Completado

- La landing Next.js permanece en la raíz y conserva sus scripts originales.
- Workspaces ejecutables para core, SDK React Native, conectores y dos Workers.
- Contratos TypeScript con IDs opacos, fechas UTC, eventos reservados y dinero exacto.
- Workers con configuración versionada, tipos generados por Wrangler, observabilidad y pruebas en el runtime de Cloudflare.
- Documentación de arquitectura, taxonomía y límites de confianza.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.

## Pendiente de fases posteriores

- Persistencia real desde Workers y bindings de Cloudflare.
- Implementación nativa del SDK React Native.
- Autenticación y dashboard Next.js.
- Credenciales y APIs de Google Ads, Meta Ads y TikTok Ads.
- Atribución, métricas y postbacks en producción.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.
