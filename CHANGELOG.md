# Changelog

Todos los cambios relevantes de Attruvi se documentan aquí.

## [Unreleased]

### Añadido

- Endpoint público y no cacheable `/api/health` con release y request ID no sensibles.
- Runbook reproducible de producción, rollback e incidentes.
- Guía “Empieza aquí” para instalación y operación no técnica.
- Configuración explícita de staging para Supabase, Vercel y ambos Workers.

### Corregido

- Compatibilidad de Workers con las nuevas claves secretas de Supabase sin enviarlas como Bearer.
- Replay reproducible de migraciones cuando el trigger automático de RLS ya existe en producción.
- Permisos mínimos de `service_role` sobre las funciones privadas de pertenencia.
- Seed de Auth con identidad de correo válida y campos no nulos para smoke tests SSR.
- Logs estructurados de ingestión sin payloads sensibles.
