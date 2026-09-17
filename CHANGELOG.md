# Changelog

Todos los cambios relevantes de Attruvi se documentan aquí.

## [Unreleased]

### Añadido

- Endpoint público y no cacheable `/api/health` con release y request ID no sensibles.
- Comprobación profunda `/api/health?deep=1` de los Workers de enlaces e ingestión, con timeout, latencia y resultado redactado.
- Runbook reproducible de producción, rollback e incidentes.
- Guía “Empieza aquí” para instalación y operación no técnica.
- Configuración explícita de staging para Supabase, Vercel y ambos Workers.
- Job de postbacks en Vercel cada cinco minutos.
- Despliegue verificado de web, Supabase, Workers, KV, Queue y DLQ en los recursos existentes.

### Corregido

- Compatibilidad de Workers con las nuevas claves secretas de Supabase sin enviarlas como Bearer.
- Replay reproducible de migraciones cuando el trigger automático de RLS ya existe en producción.
- Permisos mínimos de `service_role` sobre las funciones privadas de pertenencia.
- Seed de Auth con identidad de correo válida y campos no nulos para smoke tests SSR.
- Logs estructurados de ingestión sin payloads sensibles.
- Rotación de la clave server-side de Supabase en Vercel y Cloudflare, seguida de revocación de las claves sustituidas.
