# Arquitectura de Attruvi

## Flujo completo

```text
anuncio
  → enlace Attruvi (workers/links)
  → clic con click_id opaco
  → tienda o app mediante redirect HTTP / Universal Link / App Link
  → primera apertura del SDK React Native
  → ingestión validada (workers/ingest)
  → candidatos y atribución explicable
  → eventos y sesiones posteriores
  → compras y suscripciones en unidades monetarias menores
  → métricas diarias por fuente/campaña/grupo/anuncio
  → trabajo de postback idempotente
  → Google Ads / Meta Ads / TikTok Ads
```

La landing de Next.js permanece en la raíz para conservar el proyecto y el dominio actuales de Vercel. Los paquetes nuevos son workspaces npm ligeros; no se ha movido ni duplicado la aplicación web.

## Responsabilidades

| Componente | Responsabilidad | No debe hacer |
|---|---|---|
| Next.js raíz | Landing, panel autenticado, gestión de apps y constructor de enlaces | Guardar secretos de red en el navegador |
| `packages/core` | IDs opacos, contratos y validación compartida | Depender del DOM o de React Native |
| `packages/react-native` | SDK público: identidad segura, consentimiento, sesiones, atribución, cola offline y entrega por lotes | Contener una clave de servidor o recopilar IDFA/AAID sin permiso |
| `packages/connectors` | Contratos normalizados para gasto publicitario | Inventar resultados cuando falten credenciales |
| `workers/links` | Resolver enlaces desde KV/Supabase, producir clics en Queue y redirigir | Mostrar una página intermedia o guardar IP/UA en claro |
| `workers/ingest` | Resolver la appKey, limitar abuso, validar contratos, encolar y persistir por lotes | Confiar en IDs de tenant del dispositivo o usar la appKey como permiso de lectura |
| Supabase | Fuente de verdad, Auth, RLS, idempotencia y colas | Exponer `service_role` a clientes |

## Límites de confianza

- El navegador y el SDK son clientes no confiables. Un `organization_id`, `app_id`, importe o timestamp recibido debe validarse y relacionarse con la clave pública de la app en el servidor.
- La clave del SDK identifica una app y puede revocarse; no es un secreto. Solo el hash se almacena en Postgres.
- La identidad `service_role` queda exclusivamente en Workers y procesos de servidor. Es la única que escribe clics, instalaciones, eventos, métricas y trabajos.
- Los miembros autenticados leen únicamente organizaciones verificadas mediante `organization_members`. Los roles `owner` y `admin` administran configuración.
- Los identificadores publicitarios y pruebas de atribución no implican exactitud absoluta. Cada atribución conserva método, confianza, evidencia y versión de reglas.
- iOS y Android pueden limitar señales. No se realizará fingerprinting oculto ni se elevará una coincidencia probabilística a determinista.

## Flujo de datos y fallos

1. `workers/links` valida el slug, genera un identificador criptográficamente seguro, acepta el clic en Queue y responde `302`. KV guarda resoluciones positivas y negativas; las ediciones del panel purgan las claves afectadas.
2. El SDK manda lotes pequeños con `event_id` e `idempotency_key` estables. `workers/ingest` resuelve el hash de la appKey mediante una configuración cacheada, aplica límites por app/IP, valida los esquemas de `packages/core` y responde `202` después de publicar un único mensaje en Queue.
3. El consumidor agrupa hasta 50 mensajes en una sola RPC `SECURITY INVOKER`. Postgres vuelve a comprobar clave, app, organización y entorno, y sus restricciones absorben entregas repetidas sin duplicar instalaciones, eventos, compras ni suscripciones.
4. Los jobs se reclaman con `FOR UPDATE SKIP LOCKED`; una llamada externa nunca mantiene abierta la transacción.
5. Los errores recuperables pasan a reintento con backoff; los permanentes quedan auditados y visibles.

El Worker de enlaces resuelve destinos reales mediante una RPC exclusiva de `service_role`, sirve AASA/assetlinks y persiste lotes idempotentes desde Queue. El SDK React Native produce el contrato público completo. El Worker de ingestión fija `received_at` y `request_id`, entrega a Queue y persiste de forma idempotente instalaciones, identidades hasheadas, sesiones, eventos, compras, suscripciones y señales de atribución. La appKey es deliberadamente pública: su estado, ámbito y cuotas se validan, pero una lectura de atribución requiere además una prueba opaca propia de la instalación.

## Flujo específico de ingestión

```text
React Native SDK
  → POST /v1/installations | /v1/events/batch | /v1/identify
  → cuerpo acotado + Zod + reglas PII/reloj/origen lógico
  → SHA-256(appKey) → KV → RPC de configuración solo si falta caché
  → Rate Limiting de Cloudflare por IP y por app
  → Queue: attruvi-ingest-events
  → consumidor de hasta 50 mensajes
  → una RPC ingest_sdk_messages(jsonb)
  → instalaciones / identidades / sesiones / eventos / ingresos / atribución
  ├─ éxito: ack + métricas de persistencia y lag
  ├─ temporal: reintento exponencial
  └─ permanente/agota reintentos: DLQ sin payload ni PII
```

`GET /v1/attribution` no acepta solo la appKey. Exige `installation_id` y el token emitido al registrar esa instalación; Postgres conserva únicamente su hash. App Attest/Play Integrity tiene un punto de extensión y un modo `required` que falla de forma cerrada, pero el MVP no finge validar un token hasta conectar los verificadores oficiales.

## Flujo específico de un enlace

```text
dashboard autenticado
  → RPC atómica (app/fuente/campaña/grupo/anuncio/enlace/destinos)
  → purga autenticada de KV
  → GET https://<dominio>/<slug>
  ├─ app instalada + asociación válida
  │    → Universal Link/App Link abre la app
  │    → SDK recibe la URL original y la envía a ingestión
  └─ petición llega al Worker
       → resolución KV o RPC de servicio
       → click_id + UTMs + IDs publicitarios
       → Queue (entrega duradera)
       ├─ iOS: 302 a App Store
       ├─ Android: 302 a Google Play + Install Referrer
       └─ web: 302 al fallback con parámetros
       → consumidor por lotes
       → link_clicks (unicidad app + dedupe_key)
```

Cuando el sistema operativo abre la app directamente, puede no solicitar la ruta de red al Worker. En ese caso el SDK es quien registra la apertura y las señales contenidas en la URL; no se inventa un clic edge que no ocurrió.

## Escala

`events`, `link_clicks` y `postback_attempts` empiezan sin particionar para evitar la complejidad de claves únicas globales durante la primera etapa. Todas las claves externas tienen índices de cobertura y la escritura de ingestión no realiza una llamada a Supabase por evento. La migración documenta el umbral y la retención. Al superar de forma sostenida 100 millones de filas, se crearán tablas mensuales por `occurred_at`, `clicked_at` y `attempted_at`, con escritura dirigida por mes, partición futura precreada y retirada de particiones vencidas. La idempotencia global seguirá en una tabla de claves compacta o se incluirá el mes en la clave de enrutamiento antes de migrar.
