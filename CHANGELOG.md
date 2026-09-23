# Changelog

Todos los cambios relevantes de Attruvi se documentan aquí.

## [Unreleased]

### Añadido

- Guía y bootstrap reproducible para continuar Attruvi desde macOS con Node 24, Codex y los proyectos cloud existentes, sin copiar secretos entre equipos.
- Plantillas `.dev.vars.example` para ejecutar ambos Workers localmente sin publicar credenciales.
- Endpoint público y no cacheable `/api/health` con release y request ID no sensibles.
- Comprobación profunda `/api/health?deep=1` de los Workers de enlaces e ingestión, con timeout, latencia y resultado redactado.
- Runbook reproducible de producción, rollback e incidentes.
- Guía “Empieza aquí” para instalación y operación no técnica.
- Configuración explícita de staging para Supabase, Vercel y ambos Workers.
- Job de postbacks en Vercel cada cinco minutos.
- Despliegue verificado de web, Supabase, Workers, KV, Queue y DLQ en los recursos existentes.
- Acceso con Google OAuth publicado para usuarios externos, conectado a Supabase y verificado desde la landing hasta el selector oficial de cuentas.

### Corregido

- Generación explícita de tipos de rutas de Next.js antes de TypeScript, para que un clon nuevo no dependa de artefactos `.next` de una compilación anterior.
- Finalización del onboarding para apps con iOS y Android: el guardado usa la restricción única explícita y admite reintentos sin duplicar la app ni sus plataformas.
- Compatibilidad de Workers con las nuevas claves secretas de Supabase sin enviarlas como Bearer.
- Replay reproducible de migraciones cuando el trigger automático de RLS ya existe en producción.
- Permisos mínimos de `service_role` sobre las funciones privadas de pertenencia.
- Seed de Auth con identidad de correo válida y campos no nulos para smoke tests SSR.
- Logs estructurados de ingestión sin payloads sensibles.
- Rotación de la clave server-side de Supabase en Vercel y Cloudflare, seguida de revocación de las claves sustituidas.
- Configuración de compilación y desarrollo en Next.js con indicador explícito Webpack (`--webpack`) en `package.json`, evitando errores de resolución de Turbopack en entornos con enlaces simbólicos o junctions de disco.
