# Operación y rollback de producción

Este runbook evita depender de pasos manuales no documentados. Nunca copies secretos a comandos con eco, capturas, incidencias o Git. Los nombres de recursos pueden consultarse en cada proveedor; los IDs y valores reales no pertenecen a este documento.

## Topología validada

- Web y dashboard: Vercel, proyecto existente `attruvi`, con `https://attruvi.com` y `https://www.attruvi.com`.
- Base de datos y Auth: proyecto Supabase existente `Attruvi`.
- Enlaces e ingestión: Workers de Cloudflare separados, con KV y Queue/DLQ por servicio.
- DNS público de `attruvi.com`: permanece en su proveedor actual. No se cambia una zona ni un nameserver para desplegar Attruvi.

Hasta disponer de una zona de `attruvi.com` gestionada por Cloudflare, los Workers usan sus URLs `workers.dev`. Eso no afecta al dashboard ni al transporte del SDK, pero Universal Links/App Links de producción deben esperar a un dominio asociado estable.

## Puertas antes de desplegar

1. Rama de release identificada, diferencias revisadas y ningún cambio ajeno incluido.
2. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build:workspaces` y build remoto de Vercel en verde.
3. `npm run security:check` sin secretos ni vulnerabilidades altas.
4. Migraciones aplicadas primero en una rama de Supabase, nueve suites pgTAP en verde y E2E sintético exacto.
5. Workers de staging saludables y colas sin mensajes fallidos permanentes.
6. Preview de Vercel autenticada mediante sesión SSR y rutas privadas protegidas.

## Orden de producción

1. Capturar la versión actual de Vercel y las versiones activas de ambos Workers.
2. Comprobar backups/PITR de Supabase y aplicar solo migraciones idempotentes pendientes.
3. Ejecutar pruebas de RLS y consultas de esquema que reviertan su transacción.
4. Desplegar Workers, comprobar `/health` y publicar primero tráfico de prueba.
5. Configurar Vercel desde su almacén de variables y desplegar con `vercel deploy --prod`.
6. Comprobar `/api/health`, `/api/health?deep=1`, landing, Auth, dashboard, cron y E2E en modo development/dry-run.
7. Revisar logs redactados, latencia, lag de Queue, frescura de sync y resultados de postback.

## Rollback

### Vercel

Conserva la URL del último deployment sano antes del release. Si falla la aceptación:

```bash
vercel rollback <deployment-url-sano>
vercel inspect <deployment-url-sano>
```

El rollback cambia el tráfico; no borra el deployment fallido. Después revisa `/api/health` y las rutas públicas y privadas.

### Cloudflare Workers

Antes del despliegue:

```bash
npx wrangler deployments list --name attruvi-links
npx wrangler deployments list --name attruvi-ingest
```

Anota los version IDs sin publicarlos. Para volver a una versión sana:

```bash
npx wrangler rollback <version-id> --name attruvi-links --message "rollback operativo"
npx wrangler rollback <version-id> --name attruvi-ingest --message "rollback operativo"
```

No borres KV ni Queues al revertir código. La idempotencia de Postgres y `event_id` permite reprocesar mensajes.

### Supabase

Las migraciones de producción son forward-only. Antes de DDL confirma backup/PITR; si una migración falla, detén Workers/cron que dependan de ella y aplica una migración correctiva nueva. No edites a mano el historial ni reviertas tablas con datos mediante `DROP`.

La concesión técnica añadida en esta release puede revocarse, si fuese imprescindible, con una migración nueva que haga `REVOKE USAGE ON SCHEMA private FROM service_role` y revoque las funciones concretas. La restauración del trigger automático de RLS es idempotente y no debe eliminarse: protege tablas públicas futuras.

## Runbooks de incidentes

### Cola atrasada

1. Comprueba lag, profundidad, reintentos, DLQ y errores del consumidor.
2. Si Supabase está degradado, deja que Queue retenga y reintente; no hagas replay simultáneo.
3. Corrige la causa, prueba un único mensaje y aumenta concurrencia solo después.
4. Reprocesa DLQ por lotes pequeños conservando `event_id`; confirma que los duplicados no crean filas nuevas.

### Proveedor publicitario caído

1. Pausa solo el destino afectado; enlaces, ingestión, costes manuales y métricas continúan.
2. Mantén trabajos en `retryable_failed` con `Retry-After`/backoff.
3. No marques `succeeded` ni inventes identificadores.
4. Al recuperarse, prueba configuración y reproduce trabajos auditados por lotes.

### Token caducado o revocado

1. La integración pasa a “Pendiente de credenciales” o “Requiere reconexión”.
2. Revoca el ciphertext local y el token en el proveedor cuando exista endpoint oficial.
3. Reconecta por OAuth; nunca pegues refresh tokens en la base, logs o navegador.
4. Ejecuta sync solapado de tres días y revisa “Sin relacionar”.

### Migración fallida

1. No avances Workers ni web.
2. Guarda nombre, error redactado y estado de migraciones; no copies datos de filas.
3. Si la transacción revirtió, corrige el SQL y valida en una rama nueva.
4. Si hubo cambios parciales no transaccionales, restaura mediante PITR o migración correctiva revisada.
5. Repite RLS, advisor, pgTAP y E2E antes de reanudar.

## Señales y alertas

- Web: estado de deployment, `/api/health`, errores 5xx y latencia.
- Dependencias: `/api/health?deep=1` debe devolver `ok` para links e ingest; `degraded` no debe promoverse sin explicar la incidencia.
- Links: `/health`, redirects, errores, latencia y lag/DLQ de clics.
- Ingest: `/health`, `accepted`, `rejected`, `queued`, `persisted`, lag y DLQ.
- Supabase: conexiones, errores de Auth, advisor de seguridad, tamaño y consultas lentas.
- Conectores: `last_sync_at`, token caducado y filas sin relacionar.
- Postbacks: éxito, `skipped` por motivo, p95, rate limit y permanently failed.

Los logs solo incluyen timestamp, servicio, nivel, código, request/trace ID e identificadores operativos reducidos. Nunca incluyen payloads completos, correos, IP/agente en claro, click IDs, tokens o secretos.
