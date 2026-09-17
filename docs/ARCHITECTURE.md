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
| `packages/react-native` | Superficie pública del futuro SDK | Contener una clave de servidor |
| `packages/connectors` | Contratos normalizados para gasto publicitario | Inventar resultados cuando falten credenciales |
| `workers/links` | Resolver enlaces desde KV/Supabase, producir clics en Queue y redirigir | Mostrar una página intermedia o guardar IP/UA en claro |
| `workers/ingest` | Validar lotes del SDK antes de persistirlos | Confiar en `organization_id` del dispositivo |
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
2. El SDK manda lotes pequeños con `event_id` e `idempotency_key` estables. `workers/ingest` aplica los esquemas de `packages/core`.
3. Postgres impone unicidad por app para que los reintentos no dupliquen eventos, compras, costes ni postbacks.
4. Los jobs se reclaman con `FOR UPDATE SKIP LOCKED`; una llamada externa nunca mantiene abierta la transacción.
5. Los errores recuperables pasan a reintento con backoff; los permanentes quedan auditados y visibles.

El Worker de enlaces ya resuelve destinos reales mediante una RPC exclusiva de `service_role`, sirve AASA/assetlinks y persiste lotes idempotentes desde Queue. El Worker de ingestión sigue siendo una base contractual: la implementación del SDK y el pipeline de eventos pertenecen a la fase siguiente. Los bindings y secretos de producción se mantienen pendientes de configuración externa.

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

`events`, `link_clicks` y `postback_attempts` empiezan sin particionar para evitar la complejidad de claves únicas globales durante la primera etapa. La migración documenta el umbral y la retención. Al superar de forma sostenida 100 millones de filas, se crearán tablas mensuales por `occurred_at`, `clicked_at` y `attempted_at`, con escritura dirigida por mes, partición futura precreada y retirada de particiones vencidas. La idempotencia global seguirá en una tabla de claves compacta o se incluirá el mes en la clave de enrutamiento antes de migrar.
