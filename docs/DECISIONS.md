# Decisiones de arquitectura

## ADR-001 — Mantener Next.js en la raíz

Estado: aceptada. La integración de Vercel y el dominio existentes dependen de la raíz actual. Los nuevos componentes se añaden como workspaces sin mover la landing.

## ADR-002 — Contratos compartidos con Zod y IDs opacos

Estado: aceptada. Los límites HTTP validan datos en ejecución y TypeScript evita mezclar IDs que son UUID en todos los casos. Las fechas se normalizan a UTC y los importes terminan como `bigint`.

## ADR-003 — Postgres como límite de aislamiento e idempotencia

Estado: aceptada. La aplicación no es la única defensa: RLS, FKs compuestas, checks e índices únicos protegen tenants y reintentos.

## ADR-004 — Dos helpers RLS con privilegios mínimos

Estado: aceptada. Consultar `organization_members` desde su propia policy sería recursivo. Los helpers `SECURITY DEFINER` quedan en un esquema no expuesto, validan `auth.uid()`, fijan un search path vacío y solo devuelven booleanos.

## ADR-005 — Escritura operativa solo con identidad de servicio

Estado: aceptada. El SDK no puede insertar directamente clics, eventos, costes, métricas ni jobs. Los clientes autenticados solo leen; Workers y procesos internos usan una clave de servidor que jamás llega al navegador.

## ADR-006 — Particionado diferido con umbral explícito

Estado: aceptada. Particionar hoy complicaría la unicidad global necesaria para deduplicar. Se mantiene un diseño indexado y una migración concreta al superar 100 millones de filas, con retención por particiones.

## ADR-007 — Fecha de compatibilidad Cloudflare

Estado: aceptada. Los Workers usan `2026-09-16`, la fecha más reciente soportada por el runtime instalado y publicada en la documentación consultada el 2026-09-17. Se actualizará junto con Wrangler y sus pruebas.

## ADR-008 — Sesiones Supabase SSR verificadas

Estado: aceptada. El navegador inicia OAuth con PKCE y los Route Handlers intercambian el código por cookies. `proxy.ts` refresca tokens en rutas privadas, pero la autorización real vuelve a comprobar `getClaims()` en la capa de acceso a datos, Server Actions y APIs. `getSession()` no se usa como prueba de identidad.

## ADR-009 — Espacio personal mediante RPC atómica

Estado: aceptada. El primer acceso necesita crear tres filas dependientes sin estados parciales. `ensure_personal_workspace`, `save_personal_onboarding_draft` y `complete_personal_onboarding` son `SECURITY DEFINER` porque deben atravesar RLS de forma transaccional. Están limitadas a `authenticated`, fijan `search_path = ''`, validan `auth.uid()`, no aceptan identificadores de tenant y aplican un bloqueo transaccional por usuario.

## ADR-010 — Respuestas de autenticación no enumerables

Estado: aceptada. El acceso incorrecto, la recuperación y el reenvío no exponen mensajes internos del proveedor ni confirman si una cuenta existe. La interfaz añade bloqueo mientras una petición está activa y 60 segundos entre reenvíos; Supabase mantiene el límite definitivo del servidor.
