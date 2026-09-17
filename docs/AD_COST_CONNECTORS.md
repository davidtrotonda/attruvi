# Costes publicitarios

Attruvi importa el gasto diario de Google Ads, Meta Ads y TikTok Ads, y también permite cargar costes manuales. El panel conserva la moneda original, relaciona los identificadores externos con la jerarquía de Attruvi y mantiene en **Sin relacionar** cualquier fila que no pueda asignar de forma segura.

## Versiones y contratos oficiales

Las versiones están fijadas en código; no se selecciona silenciosamente una versión más reciente:

| Proveedor | Versión | Autorización | Lectura |
|---|---:|---|---|
| Google Ads | `v25` | OAuth 2.0, scope `https://www.googleapis.com/auth/adwords` | `GoogleAdsService.Search`, `metrics.cost_micros`, campaña, grupo, anuncio y fecha |
| Meta Marketing API | `v26.0` | OAuth, permisos `ads_read` y `business_management` | `/{act_account}/insights`, nivel `ad`, `time_increment=1`, `spend` y `account_currency` |
| TikTok Marketing API | `v1.3` | OAuth de TikTok for Business | `/report/integrated/get/`, nivel `AUCTION_AD`, gasto y dimensiones campaña/grupo/anuncio |
| Manual | `manual-v1` | Sesión Attruvi con rol owner/admin | Día, rango repartido exactamente o CSV |

Fuentes oficiales consultadas el 17 de septiembre de 2026:

- [Google Ads: reporting](https://developers.google.com/google-ads/api/docs/reporting/overview), [OAuth](https://developers.google.com/google-ads/api/docs/oauth/internals) y [Search v25](https://developers.google.com/google-ads/api/reference/rpc/v25/GoogleAdsService/Search).
- [Meta Marketing API](https://www.postman.com/meta/facebook-marketing-api/overview) y [anuncios oficiales de versiones](https://developers.meta.com/blog/).
- [TikTok Business API](https://business-api.tiktok.com/portal/docs), con reporting y OAuth en `open_api/v1.3`.

Antes de actualizar una versión hay que cambiar el adaptador, los fixtures contractuales y esta tabla en el mismo commit.

## Flujo

```text
owner/admin conecta una cuenta
  → OAuth vuelve al servidor de Attruvi
  → descubre cuentas accesibles
  → guarda solo nombre, moneda, estado y ····1234 en la interfaz
  → cifra access/refresh token con AES-256-GCM ligado a la cuenta
  → guarda ciphertext + IV en private.connector_secrets
  → crea el primer job (máximo 90 días)
  → cron diario programa las cuentas pendientes
  → worker reclama con FOR UPDATE SKIP LOCKED
  → API oficial paginada
  → normalización exacta a unidades menores
  → upsert por proveedor + cuenta + external_row_id
  → match por external_id o bandeja Sin relacionar
```

Las llamadas externas se realizan después de reclamar el job, nunca dentro de una transacción larga. Un `429` o error temporal queda en reintento con backoff exponencial y respeta `Retry-After`. Un token inválido pasa la cuenta a **Vuelve a conectar**. Google puede renovar el access token con su refresh token; ningún token aparece en logs o respuestas al navegador.

Cada sincronización diaria relee tres días por defecto, configurable entre 0 y 14. Esto permite que un gasto corregido tarde reemplace la misma fila mediante un `external_row_id` estable, incrementando `correction_version` en vez de duplicarla. El máximo inicial es 90 días. El cron de Vercel ejecuta `/api/cron/ad-costs` a las 02:17 UTC y exige `CRON_SECRET`.

## Dinero y relaciones

- Todo importe se guarda como `bigint` en unidades menores junto a una moneda ISO 4217.
- Los totales del panel se agregan en Postgres por moneda; no dependen del límite de filas de PostgREST.
- Google entrega micros; la conversión a unidades menores usa redondeo entero, nunca `float`.
- Meta, TikTok y CSV usan conversión decimal exacta según el exponente de la moneda; JPY no inventa decimales.
- No se suman ni convierten monedas distintas. Una conversión futura necesitará fuente, par, tasa y fecha de cambio registradas.
- El match usa `provider + external_id` y conserva IDs/nombres históricos. Una campaña eliminada permanece en el histórico con estado desactivado.
- Una fila sin match no desaparece: conserva motivo y datos externos en **Sin relacionar**, donde un owner/admin puede asignarla manualmente con auditoría. La asignación queda como regla para las recargas y sincronizaciones futuras, no solo para la fila visible en ese momento.

## Configuración externa

Define en Vercel, solo en servidor:

```text
CONNECTOR_ENCRYPTION_KEYS=<JSON con versiones y claves aleatorias de 32 bytes en base64>
CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION=<versión usada para cifrar escrituras nuevas>
CRON_SECRET=<cadena aleatoria larga>
GOOGLE_ADS_CLIENT_ID=<OAuth web client id>
GOOGLE_ADS_CLIENT_SECRET=<OAuth client secret>
GOOGLE_ADS_DEVELOPER_TOKEN=<developer token>
META_ADS_APP_ID=<business app id>
META_ADS_APP_SECRET=<business app secret>
TIKTOK_ADS_APP_ID=<developer app id>
TIKTOK_ADS_APP_SECRET=<developer app secret>
```

Registra exactamente estas URLs públicas:

```text
https://www.attruvi.com/api/connectors/google_ads/callback
https://www.attruvi.com/api/connectors/meta_ads/callback
https://www.attruvi.com/api/connectors/tiktok_ads/callback
```

Si las credenciales no existen, `/dashboard/costs` muestra las variables, callback y pasos pendientes. La carga manual y el resto de Attruvi siguen funcionando.

## CSV manual

El archivo admite coma o punto y coma, UTF-8, máximo 500 KB y 1.000 filas. Columnas obligatorias:

```csv
date,amount,currency
2026-09-15,19.90,EUR
```

Columnas opcionales: `row_id`, `campaign_id`, `campaign_name`, `ad_group_id`, `ad_group_name`, `ad_id`, `ad_name`, `impressions`, `clicks`. `date` usa `YYYY-MM-DD`; `amount` usa punto decimal. La huella del archivo y `row_id` hacen idempotente una recarga del mismo CSV.

## Operación y pruebas

- `GET /api/cron/ad-costs` lo invoca Vercel con `Authorization: Bearer $CRON_SECRET`; `POST` permite la misma ejecución controlada.
- El panel permite encolar una sincronización manual sin duplicar un rango abierto.
- Las RPC de escritura derivan organización y app de una cuenta o pertenencia validada; el navegador no decide el tenant.
- Los fixtures sanitizados prueban paginación, `429`, token caducado, refresh, correcciones tardías, JPY, campaña eliminada, TikTok v1.3 y CSV inválido.
- `supabase/tests/ad_cost_connectors_test.sql` prueba RLS, secretos inaccesibles, idempotencia, asignación, jobs y precisión monetaria.
