# Decisiones de arquitectura

## ADR-001 — Mantener Next.js en la raíz

Estado: aceptada. La integración de Vercel y el dominio existentes dependen de la raíz actual. Los nuevos componentes se añaden como workspaces sin mover la landing.

## ADR-002 — Contratos compartidos con Zod y IDs opacos

Estado: aceptada. Los límites HTTP validan datos en ejecución y TypeScript evita mezclar IDs que son UUID en todos los casos. Las fechas se normalizan a UTC y los importes terminan como `bigint`.

## ADR-007 — Fecha de compatibilidad Cloudflare

Estado: aceptada. Los Workers usan `2026-09-16`, la fecha más reciente soportada por el runtime instalado y publicada en la documentación consultada el 2026-09-17. Se actualizará junto con Wrangler y sus pruebas.
