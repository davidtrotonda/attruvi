# Actividad, identidad e ingresos

Esta capa convierte los mensajes del SDK en un historial reproducible. `events` conserva lo que llegó; las sesiones, el libro mayor y las métricas son proyecciones que pueden reconstruirse cuando un evento llega tarde.

## Identidad sin PII

- Cada instalación empieza con un `app_user` seudónimo, persistente solo dentro de esa app, y una relación en `app_user_installations`; no es anonimato irreversible.
- `identify(userId)` guarda únicamente SHA-256. Si el perfil aún no estaba identificado, adopta la identidad conocida sin mover ni borrar sus eventos.
- Una reinstalación que declara el mismo hash se enlaza al perfil conocido y conserva ambas instalaciones.
- Si una instalación ya está unida a otro hash conocido, la operación falla con `identity_conflict`; Attruvi nunca fusiona dos usuarios conocidos por aproximación.
- `erase_app_user` elimina hashes y traits, marca el perfil como borrado y conserva eventos e importes anonimizados para no romper el libro contable.

## Sesiones

`apps.session_timeout_minutes` vale 30 por defecto y admite de 5 a 1.440 minutos. Las sesiones analíticas no confían en `sessionId` del cliente: ordenan todos los eventos por `occurred_at, event_id` y abren otra sesión cuando el hueco es mayor que el umbral. Si llega actividad atrasada, se reconstruye la instalación de forma determinista.

`sessions` sigue siendo el sobre de transporte del SDK y permite asociar reactivaciones. `activity_sessions` es la fuente fiable para recuentos, retención y el explorador.

## Ingresos contables

`revenue_ledger` es inmutable e idempotente por `(app_id, transaction_id, event_type)`. Una compra o renovación positiva no se modifica para representar un reembolso: se añade una fila `refund` o `subscription_refunded` con importe negativo y `original_transaction_id`.

Se mantienen dos importes distintos:

- `revenue_reported_minor`: lo declarado por la app y disponible de inmediato.
- `revenue_verified_minor`: resultado opcional de App Store, Google Play o RevenueCat.

`revenue_validations` y `ReceiptValidator` son la interfaz preparada para esos proveedores. Mientras no haya credenciales y una respuesta oficial, el estado permanece `reported` o `pending`; nunca se presenta como verificado. No se suman monedas diferentes: las métricas conservan un objeto por moneda. `ltv_observed_minor` solo suma la moneda configurada de la app.

## Suscripciones

`subscription_events` conserva inicio, renovación, cancelación, expiración y reembolso. El estado de `subscriptions` se reconstruye por tiempo de ocurrencia, no por orden de recepción. La fila actual expone `lifecycle_status`, fechas relevantes, revenue declarado/verificado y estado de validación; el historial nunca se sobrescribe.

## Atribución histórica

Al procesar por primera vez un evento se elige la atribución vigente: la reactivación más reciente anterior al evento o, si no existe, la adquisición. El evento copia ID, ámbito, versión y nombres de fuente/campaña/grupo/anuncio. Cambiar después el nombre de una campaña no reescribe ingresos históricos.

## Desinstalación inferida

El SDK no puede enviar `uninstall_inferred`. La única entrada disponible es `record_push_token_invalidation`, restringida a `service_role`, con un hash de token APNS/FCM. Se requieren al menos dos invalidaciones separadas 24 horas. Solo entonces se crea `uninstall_inferences` con `inferred_at`, evidencia minimizada y confianza 0,85. Sigue siendo una inferencia, nunca una desinstalación confirmada.

## Explorador

`/dashboard/users` pagina 25 perfiles desde el servidor, filtra por app, plataforma y estado de pago, y muestra IDs abreviados. El detalle combina clic, instalación, sesiones, eventos, ingresos y postbacks. No consulta ni muestra email, nombre, `userId`, hash de identidad, token push ni propiedades libres.
