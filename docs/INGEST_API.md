# API de ingestión del SDK

`workers/ingest` es la entrada pública versionada de Attruvi. El camino síncrono hace únicamente validación acotada, comprobación cacheada de la app, rate limiting y un envío a Cloudflare Queue. No escribe una fila por evento ni llama a Supabase por evento.

## Flujo y límites de confianza

```text
SDK → límites de cuerpo → appKey cacheada → contrato/PII/reloj → rate limit
    → Queue (202 rápido) → consumidor de hasta 50 mensajes
    → una RPC Supabase → instalaciones/sesiones/eventos/ingresos/atribución
                         ↘ dead-letter segura, sin payload, si el fallo es permanente
```

La `appKey` identifica app y entorno, pero es pública. Nunca se usa como autorización de lectura. `GET /v1/attribution` exige además el token opaco emitido por `POST /v1/installations`; Supabase solo guarda su SHA-256. Las identidades de usuario y anónimas también se guardan hasheadas.

Se aceptan relojes de dispositivo atrasados hasta 365 días. Un evento más de diez minutos en el futuro se rechaza con `422`. Esto evita perder actividad offline legítima sin aceptar fechas arbitrarias.

La capa de App Attest/Play Integrity está preparada mediante `attestation_mode`. En `optional`, el MVP acepta tráfico sin token y marca como `unverified` un token hasta conectar un verificador oficial. `required` falla de forma cerrada si no existe verificador; no se simula una validación criptográfica.

## Configuración

1. Crea `attruvi-ingest-events`, `attruvi-ingest-dead-letter`, el KV de configuración y el dataset Analytics Engine.
2. Asocia los bindings de `wrangler.jsonc`. Los `namespace_id` de rate limiting son espacios lógicos independientes, no secretos.
3. Carga `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `CLICK_HASH_SALT` con `wrangler secret put`; nunca los pongas en Git. El salt debe ser el mismo valor aleatorio usado por `workers/links`.
4. Aplica todas las migraciones versionadas de `supabase/migrations` en orden; ingestión incluye el pipeline, dos correcciones reproducibles y el endurecimiento/índices posterior.
5. Despliega con `npx wrangler deploy` desde `workers/ingest`.

La configuración positiva de una app se conserva en KV entre 5 y 300 segundos, limitada además por `APP_CONFIG_CACHE_TTL_SECONDS`; el valor por defecto es 60. Una clave desconocida se cachea solo 15 segundos. Por tanto, una revocación puede tardar como máximo el menor de ambos TTL en propagarse a un edge que ya tenía una entrada válida.

El consumidor llama a `ingest_sdk_messages_v2`. Esa RPC persiste primero el lote idempotente y
después atribuye la adquisición cuando contiene `install`, o la reactivación cuando una sesión nueva
contiene `app_open`/`session_start`. Solo si la regla activa permite coincidencia probabilística el
Worker añade dos hashes minimizados; nunca encola la IP o el agente de usuario originales.

Para desarrollo reproducible:

```bash
copy .dev.vars.example .dev.vars
npm run dev
npm test
```

Wrangler usa Miniflare localmente. Las pruebas unitarias usan `MemoryQueueAdapter`; ese adaptador no se importa en producción.

## Ejemplos ficticios

```bash
curl -X POST http://127.0.0.1:8787/v1/installations \
  -H "content-type: application/json" \
  -H "x-attruvi-app-key: attruvi_demo_public_key_only" \
  -H "x-attruvi-sdk: react-native/0.1.0" \
  --data '{"installationId":"20000000-0000-4000-8000-000000000099","anonymousId":"21000000-0000-4000-8000-000000000099","occurredAt":"2026-09-17T10:00:00Z","environment":"development","platform":"android","sdkVersion":"0.1.0","consent":"granted"}'
```

```bash
curl -X POST http://127.0.0.1:8787/v1/events/batch \
  -H "content-type: application/json" \
  -H "x-attruvi-app-key: attruvi_demo_public_key_only" \
  -H "x-attruvi-sdk: react-native/0.1.0" \
  --data '{"batchId":"40000000-0000-4000-8000-000000000099","sentAt":"2026-09-17T10:00:02Z","environment":"development","platform":"android","sdkVersion":"0.1.0","events":[{"eventId":"30000000-0000-4000-8000-000000000099","installationId":"20000000-0000-4000-8000-000000000099","anonymousId":"21000000-0000-4000-8000-000000000099","sessionId":"22000000-0000-4000-8000-000000000099","name":"purchase","occurredAt":"2026-09-17T10:00:01Z","idempotencyKey":"purchase:demo-order-99","properties":{"transactionId":"demo-order-99","valueMinor":"4990","currency":"EUR"}}]}'
```

El contrato completo está en `workers/ingest/openapi.yaml`.

## Reintentos, DLQ y observabilidad

- Queue entrega al menos una vez; `event_id`, `idempotency_key`, instalación, sesión, compra y suscripción tienen conflictos idempotentes.
- Los estados `408`, `425`, `429` y `5xx` de Supabase se reintentan con backoff. Los fallos permanentes y los reintentos agotados producen una entrada DLQ que solo contiene IDs operativos, intento y motivo seguro.
- La DLQ es explícita: no se configura el reenvío automático de Cloudflare porque copiaría el mensaje original completo. Si la propia DLQ está temporalmente caída, el consumidor reintenta el original hasta poder escribir el sobre sanitizado.
- No se imprimen cuerpos, claves, tokens, traits ni propiedades. Los logs contienen ruta, `request_id` y clase del error.
- Analytics Engine recibe `accepted`, `rejected`, `queued`, `persisted` y `lag` con app/route/código como dimensiones de baja cardinalidad.

Tras aplicar las migraciones, el asesor remoto de Supabase no reporta claves externas sin índice ni funciones técnicas ejecutables por usuarios. Permanecen seis avisos genéricos sobre RPC `SECURITY DEFINER` autenticadas que son deliberadas y están justificadas en `docs/DECISIONS.md`; los avisos de índices sin uso son esperables en un esquema recién creado sin carga real.

## Prueba de carga

Ejecuta `npm run load:test -w @attruvi/worker-ingest`. La prueba envía 5.000 solicitudes con concurrencia 100 por el camino real de lectura acotada, Zod, controles de PII/reloj y cola en memoria. No mide la red de Cloudflare ni Supabase; mide exclusivamente la capacidad local del camino síncrono y debe volver a ejecutarse en CI o en el hardware de despliegue antes de usar sus cifras para dimensionar producción.

Resultado medido el 17 de septiembre de 2026 en este equipo Windows: 5.000/5.000 respuestas `202`, 1.025 ms totales, 4.878,05 solicitudes/s, p50 13 ms y p95 27 ms, con concurrencia 100. La inicialización del runner no forma parte de esos 1.025 ms. Es una medición local del código y la cola en memoria, no una promesa de rendimiento de red ni de la base de datos.
