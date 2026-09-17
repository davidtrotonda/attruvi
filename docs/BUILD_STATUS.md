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
- Sección multiapp para crear y editar apps iOS/Android con identificadores, moneda, zona horaria y estado.
- Constructor no técnico de enlaces con fuente, jerarquía publicitaria, UTM, afiliado/creador, deep link, destinos, slug y ventana de atribución.
- Listado para copiar, probar, editar, activar y desactivar enlaces, con clics válidos separados por plataforma.
- Worker de enlaces completo con redirect HTTP inmediato, KV, Queue, RPC de resolución, Play Install Referrer, AASA/assetlinks, bots, deduplicación y adaptador local.
- Auditoría de licencia/arquitectura de Link My App e implementación nueva sin copiar sus datos o acoplamientos.
- Documentación de arquitectura, taxonomía, modelo de datos, particionado, retención y rollback.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.
- `npm run test:schema`: contrato estructural de migración/seeds sin necesitar Docker.
- `npm run test:web`: registro, verificación, contraseña incorrecta, recuperación, Google OAuth simulado, callback seguro y clasificación de rutas privadas.
- `npm run test:db`: aislamiento RLS e invariantes en Postgres local; necesita `supabase start` y Docker.

En esta ejecución pasó `npm run verify`: lint, typecheck de raíz y cinco workspaces, 14 pruebas web, 19 pruebas de workspaces, contrato estructural SQL y builds de producción de Next.js y ambos Workers. El build incluye `/dashboard/apps` y `/dashboard/links`; el Worker de enlaces supera redirects iOS/Android/web, Unicode, Install Referrer, destinos ausentes, enlaces no disponibles, bots, deduplicación, abuso, latencia local y asociaciones nativas. En navegador se comprobó que una visita anónima a `/dashboard/links` vuelve a la landing y abre el diálogo de acceso con `next` seguro.

La suite pgTAP se amplió a 16 assertions para las RPC, slugs reservados y reintentos de Queue. `npm run test:db` no pudo conectarse a `127.0.0.1:54322` porque Supabase local/Docker no está iniciado; no se considera validada en PostgreSQL hasta ejecutar `npx supabase start` y repetirla.

## Pendiente de fases posteriores

- Implementación nativa del SDK React Native.
- Credenciales y APIs de Google Ads, Meta Ads y TikTok Ads.
- Atribución, métricas y postbacks en producción.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.

## Configuración externa pendiente

- Aplicar las migraciones al proyecto Supabase enlazado.
- Añadir en Supabase las URLs de `docs/AUTH_SETUP.md`, activar Google con su Client ID/Secret y configurar un SMTP de producción.
- Añadir las variables públicas de Supabase a los entornos de Vercel. No se requieren secretos de Google en el navegador.
- Crear KV/Queues, configurar los tres secretos del Worker y asociar el dominio de enlaces siguiendo `docs/SMART_LINKS_CLOUDFLARE.md`.
- Añadir las asociaciones reales de cada app a `association-config.ts` y comprobar Universal Links/App Links en dispositivos.
