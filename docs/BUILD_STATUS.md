# Estado de construcción

Actualizado: 2026-09-17.

## Completado

- La landing Next.js permanece en la raíz y conserva sus scripts originales.
- Workspaces ejecutables para core, SDK React Native, conectores y dos Workers.
- Contratos TypeScript con IDs opacos, fechas UTC, eventos reservados y dinero exacto.
- Workers con configuración versionada, tipos generados por Wrangler, observabilidad y pruebas en el runtime de Cloudflare.
- Modelo Supabase completo mediante migración versionada, RLS de denegación por defecto, claves idempotentes, seeds ficticios y pgTAP.
- Documentación de arquitectura, taxonomía, modelo de datos, particionado, retención y rollback.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.
- `npm run test:schema`: contrato estructural de migración/seeds sin necesitar Docker.
- `npm run test:db`: aislamiento RLS e invariantes en Postgres local; necesita `supabase start` y Docker.

En esta ejecución pasaron las pruebas TypeScript/Workers y el contrato estructural SQL. La suite pgTAP quedó creada pero no pudo ejecutarse porque este equipo no tiene Docker ni `psql`; no se considera validada en Postgres hasta correr `npm run test:db` en un entorno con Supabase local.

## Pendiente de fases posteriores

- Persistencia real desde Workers y bindings de Cloudflare.
- Implementación nativa del SDK React Native.
- Autenticación y dashboard Next.js.
- Credenciales y APIs de Google Ads, Meta Ads y TikTok Ads.
- Atribución, métricas y postbacks en producción.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.
