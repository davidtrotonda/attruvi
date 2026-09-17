# Taxonomía de eventos

Todos los eventos usan UTC ISO 8601 en el límite de red, un `event_id` UUID estable y un `idempotency_key` estable por app. El servidor registra además su propio `received_at`; nunca sustituye silenciosamente el momento declarado por el dispositivo.

## Sobre común

Obligatorio:

- `eventId`, `appId`, `installationId` e `idempotencyKey`.
- `occurredAt` con zona horaria, normalizado a UTC.
- `event.name` y `event.properties`.
- `platform`: `ios` o `android`.
- `sdkVersion`.

Opcional:

- `receivedAt`, únicamente cuando lo añade infraestructura confiable.
- Propiedades adicionales definidas por el evento y permitidas por el esquema.

Un lote contiene entre 1 y 100 eventos. Un mismo `(app_id, event_id)` o `(app_id, idempotency_key)` solo puede existir una vez.

## Eventos reservados

| Evento | Cuándo se emite | Propiedades adicionales |
|---|---|---|
| `install` | Primera apertura atribuible de una instalación | Ninguna |
| `app_open` | La app pasa a primer plano | Ninguna |
| `session_start` | Comienza una sesión según la ventana configurada | Ninguna |
| `sign_up` | Registro confirmado | Ninguna; no se envía correo ni PII |
| `purchase` | Compra declarada por la app | `transactionId`, `valueMinor`, `currency`; opcionales `orderId`, `quantity`, `products` |
| `subscription_started` | Inicio de suscripción | Campos de compra, `productId`, `subscriptionId` |
| `subscription_renewed` | Renovación declarada | Campos de compra, `productId`, `subscriptionId` |
| `subscription_cancelled` | Cancelación conocida | `productId`, `subscriptionId` |
| `subscription_expired` | Final del periodo sin renovación | `productId`, `subscriptionId` |
| `refund` | Reembolso de una compra | Campos de compra, `originalTransactionId`; `valueMinor` obligatorio y negativo |
| `subscription_refunded` | Reembolso de suscripción | Campos de suscripción, `originalTransactionId`; `valueMinor` obligatorio y negativo |
| `uninstall_inferred` | Evento interno creado por evidencia persistente del servidor | No se acepta desde el SDK público |

## Dinero

- `valueMinor` es un entero con signo compatible con `bigint` de Postgres. `4990` representa 49,90 EUR.
- En JSON, los valores que puedan superar el rango entero seguro de JavaScript se envían como cadena decimal.
- `currency` es un código ISO 4217 en mayúsculas de tres letras.
- Nunca se usa `float`; no se convierte moneda sin guardar fuente y fecha del tipo de cambio.

## Idempotencia

- El SDK crea `event_id` antes de encolar y lo conserva durante todos los reintentos.
- `idempotency_key` representa la operación de negocio. Para una compra debe derivarse de la app y `transactionId`, no de la hora del reintento.
- El servidor inserta con una restricción única; una colisión devuelve el resultado previo o `duplicate`, nunca otra fila.
- Ingresos se deduplican además por `(app_id, transaction_id, event_type)`. Así una compra y su reembolso son apuntes distintos, pero un reintento no duplica dinero. Los postbacks se deduplican por destino e idempotency key.
- Cambiar propiedades manteniendo el mismo identificador se trata como conflicto auditable, no como un evento nuevo.

Las sesiones analíticas se derivan en el servidor: un hueco superior a `apps.session_timeout_minutes` abre otra sesión. El valor predeterminado es 30 minutos. Los eventos atrasados provocan una reconstrucción ordenada; no se confía en el reloj de llegada para agruparlos.
