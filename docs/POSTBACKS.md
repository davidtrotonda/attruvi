# Postbacks server-side

Attruvi devuelve eventos atribuibles a Google Ads, Meta Ads y TikTok Ads sin exponer credenciales en el SDK o el navegador. La implementación usa Google Ads API `v25`, Meta Graph/Marketing API `v26.0` y TikTok Business API `v1.3`.

## Flujo real

```text
evento confirmado en Postgres
  → trigger inserta un trabajo idempotente en el outbox
  → worker reclama el trabajo y cierra esa transacción
  → carga consentimiento + atribución + clic + configuración cifrada
  → determina si el evento es elegible
  → construye el payload permitido justo antes de enviarlo
  → llama a la red sin ninguna transacción abierta
  → guarda resultado y un intento redactado
  → reintenta con backoff o envía a dead-letter
```

El outbox solo persiste IDs operativos y `schemaVersion`. Nunca guarda el payload del proveedor, tokens, cabeceras de autorización, `gclid`, `fbclid`, `ttclid` ni PII. El `event_id` se mantiene estable en reintentos y replay para que la red pueda deduplicar.

## Elegibilidad

Un evento se marca `skipped`, no `succeeded`, cuando falta consentimiento publicitario o una señal determinista permitida:

| Red | Señal aceptada por Attruvi | Entrega |
|---|---|---|
| Google Ads | `gclid`, `gbraid` o `wbraid` del clic atribuido | `customers:uploadClickConversions`, con `partialFailure` y consentimiento `adUserData` |
| Meta | `fbclid`, convertido en `fbc` con el timestamp del clic/evento | Conversions API con `event_name` + `event_id`, sin email, teléfono, IP ni agente |
| TikTok | `ttclid` del clic atribuido | Events API 2.0 con `event_id`, `event_source=APP` y valor opcional |

No se inventan IDs ni se realiza fingerprinting. Meta App Events que necesite identificadores de dispositivo queda fuera del MVP: Attruvi usa Conversions API únicamente cuando dispone de una señal de clic permitida.

## Estados operativos

- `pending`: listo para reclamar.
- `processing`: reservado por un worker; un lease abandonado se recupera tras 15 minutos.
- `succeeded`: el proveedor aceptó el evento o lo deduplicó.
- `retryable_failed`: rate limit, red o fallo temporal; usa `Retry-After` o backoff exponencial con jitter.
- `permanently_failed`: configuración/campo/token no recuperable o máximo de ocho intentos; queda en dead-letter.
- `skipped`: no era elegible, con motivo seguro.

El replay solo está disponible para owner/admin, crea un nuevo trabajo, mantiene el mismo `provider_event_id` y escribe `postback.replayed` en `audit_log`.

## Configuración y pruebas

En **Dashboard → Postbacks** se eligen cuenta, evento Attruvi, evento de la red, ID externo, valor, moneda y estado. Los proveedores permanecen **Pendiente de credenciales** hasta completar OAuth y las variables descritas en `docs/AD_COST_CONNECTORS.md`.

- Google usa `validate_only=true`; valida sin guardar la conversión.
- Meta exige `test_event_code` y entrega solo a Test Events.
- TikTok no expone un modo universal de Events API 2.0 que garantice no entregar. Attruvi comprueba la cuenta de forma read-only y valida localmente el payload; no envía un evento falso.

## Ejecución

`GET /api/cron/postbacks` exige `Authorization: Bearer $CRON_SECRET`. El cron diario existente de costes también procesa un lote como red de seguridad sin superar el límite de dos crons del plan actual de Vercel. Para latencia cercana a tiempo real, un scheduler externo o un plan que admita mayor frecuencia debe invocar la ruta cada minuto; la reclamación con `SKIP LOCKED` permite varios workers.

Ejemplo local ficticio:

```bash
curl -H "Authorization: Bearer replace_with_local_cron_secret" \
  http://localhost:3000/api/cron/postbacks
```

## Fuentes oficiales fijadas

- Google Ads, carga de conversiones de clic y `validate_only`: https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
- Google Ads REST `UploadClickConversionsRequest`: https://developers.google.com/google-ads/api/rest/reference/rest/v25/customers/uploadClickConversions
- Meta Conversions API y Business SDK oficial: https://github.com/facebook/facebook-nodejs-business-sdk#server-side-api
- Esquema oficial de ServerEvent de Meta: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/server_event.py
- TikTok Events API: https://business-api.tiktok.com/portal/docs?id=1771100865818625
- TikTok token refresh `v1.3`: https://business-api.tiktok.com/portal/docs?id=1738373164380162

Al actualizar una versión deben cambiar juntos el adaptador, el fixture contractual y este documento.
