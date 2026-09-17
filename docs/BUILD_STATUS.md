# Estado de construcción

Actualizado: 2026-09-17.

## Completado

- La landing Next.js permanece en la raíz y conserva sus scripts originales.
- Workspaces ejecutables para core, SDK React Native, conectores y dos Workers.
- Contratos TypeScript con IDs opacos, fechas UTC, eventos reservados y dinero exacto.
- Workers con configuración versionada, tipos generados por Wrangler, observabilidad y pruebas en el runtime de Cloudflare.
- Modelo Supabase completo mediante migración versionada, RLS de denegación por defecto, claves idempotentes, seeds ficticios y pgTAP.
- Autenticación Supabase completa con Google OAuth PKCE, correo/contraseña, verificación, reenvío con enfriamiento, recuperación, nueva contraseña y cierre de sesión.
- Sesiones SSR para Next.js 16 mediante `proxy.ts`, validación con `getClaims()`, callback seguro y protección redundante de dashboard, onboarding y APIs privadas.
- Creación atómica de perfil, organización personal y membresía owner; onboarding reanudable para la primera app sin pedir credenciales publicitarias.
- Dashboard inicial conectado al modelo real de métricas y compatible con el dataset ficticio de seeds.
- Documentación de arquitectura, taxonomía, modelo de datos, particionado, retención y rollback.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.
- `npm run test:schema`: contrato estructural de migración/seeds sin necesitar Docker.
- `npm run test:web`: registro, verificación, contraseña incorrecta, recuperación, Google OAuth simulado, callback seguro y clasificación de rutas privadas.
- `npm run test:db`: aislamiento RLS e invariantes en Postgres local; necesita `supabase start` y Docker.

En esta ejecución pasaron lint, typecheck, las 8 pruebas web de autenticación, las 7 pruebas de paquetes, el contrato estructural SQL y los builds de producción de Next.js y ambos Workers. La landing, el diálogo responsive y la redirección de una visita anónima a `/dashboard` también se comprobaron en navegador. La suite pgTAP quedó creada pero no pudo ejecutarse porque este equipo no tiene Docker ni `psql`; no se considera validada en Postgres hasta correr `npm run test:db` en un entorno con Supabase local.

## Pendiente de fases posteriores

- Persistencia real desde Workers y bindings de Cloudflare.
- Implementación nativa del SDK React Native.
- Credenciales y APIs de Google Ads, Meta Ads y TikTok Ads.
- Atribución, métricas y postbacks en producción.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.

## Configuración externa pendiente

- Aplicar las migraciones al proyecto Supabase enlazado.
- Añadir en Supabase las URLs de `docs/AUTH_SETUP.md`, activar Google con su Client ID/Secret y configurar un SMTP de producción.
- Añadir las variables públicas de Supabase a los entornos de Vercel. No se requieren secretos de Google en el navegador.
