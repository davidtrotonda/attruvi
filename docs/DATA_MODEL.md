# Modelo de datos

La fuente ejecutable son, en orden, las migraciones de `supabase/migrations/`. No se debe modificar un proyecto remoto a mano.

## Diccionario

| Área | Tablas | Función |
|---|---|---|
| Personas y acceso | `profiles`, `organizations`, `organization_members` | Perfil global y pertenencia con roles owner/admin/viewer |
| Apps | `apps`, `app_platforms`, `public_sdk_keys` | Configuración, identificadores iOS/Android y claves públicas hasheadas/revocables |
| Jerarquía publicitaria | `sources`, `campaigns`, `ad_groups`, `ads` | Fuente → campaña → grupo → anuncio con claves externas y consistencia de tenant |
| Enlaces | `smart_links`, `link_destinations`, `link_clicks` | Configuración, destinos y clics idempotentes |
| Identidad y atribución | `installations`, `identities`, `attribution_rule_sets`, `attribution_candidates`, `attributions` | Instalaciones anónimas, reglas configurables, candidatos explicables y decisiones versionadas |
| Actividad e ingresos | `events`, `sessions`, `purchases`, `subscriptions` | Recorrido posterior, dinero exacto y estados de suscripción |
| Costes | `connector_accounts`, `connector_sync_runs`, `ad_costs` | Configuración sin secretos en claro, sincronizaciones y gasto diario |
| Postbacks | `postback_destinations`, `postback_jobs`, `postback_attempts` | Mapeo y outbox reclamable de forma concurrente |
| Lectura y control | `daily_metrics`, `audit_log` | Agregados de dashboard y trazabilidad administrativa |

## Reglas estructurales

- Todos los IDs de negocio son UUID. Las tablas que pertenecen a una app incluyen `organization_id` y `app_id`.
- Las claves foráneas compuestas impiden unir filas de distintas organizaciones o apps.
- La jerarquía publicitaria estricta usa FKs compuestas. Las tablas con dimensiones opcionales tienen un trigger que valida tenant y coherencia entre niveles.
- Importes e ingresos son `bigint` en unidades menores y llevan moneda ISO; las ratios se calcularán al consultar, no se almacenan como flotantes.
- `events` tiene unicidad por `event_id` e `idempotency_key`; compras, costes, métricas y postbacks tienen sus propias claves idempotentes.
- `link_clicks` deduplica entregas por `(app_id, dedupe_key)`, distingue bots/pruebas y conserva parámetros de referrer sin guardar la IP ni el agente en claro.
- Los slugs reservados y destinos no HTTPS se rechazan tanto en la interfaz como mediante constraints.
- Los datos operativos son de solo lectura para miembros. La escritura de ingestión, rollups y jobs requiere `service_role`.
- `public_sdk_keys` contiene límites de lote/cuerpo, plataformas, prefijos SDK y política de attestation. La clave se resuelve por SHA-256; el valor legible no se guarda.
- `installations.installation_access_token_hash` protege la lectura puntual de atribución. `identities.identity_hash` evita conservar el identificador externo legible y `traits` pasa por la allowlist/antipII del Worker.
- `resolve_ingest_app_key`, `read_sdk_attribution` e `ingest_sdk_messages_v2` son `SECURITY INVOKER`, están revocadas para `public`, `anon` y `authenticated`, y solo se conceden a `service_role`.
- Las atribuciones separan `acquisition` y `reengagement`, usan un `engagement_id` estable y guardan `match_type`, confianza, explicación, ventana en segundos, fecha y versión. Los nombres e IDs externos se copian en la decisión para que un cambio posterior de campaña no reescriba la historia.
- Una sola regla puede estar activa por app. La coincidencia probabilística nace desactivada y el constraint exige base legal documentada antes de activarla.
- Todas las claves externas tienen un índice con las columnas de la relación como prefijo. Esto evita búsquedas completas al unir, actualizar o borrar padres cuando crezcan las tablas de eventos.

## RLS

Todas las tablas públicas tienen RLS activado. `anon` no recibe privilegios. Un usuario autenticado puede leer una fila solo cuando `private.is_organization_member(organization_id)` valida su membresía. `owner` y `admin` pueden mutar tablas de configuración; `viewer` no.

Las dos funciones `SECURITY DEFINER` de `private` son helpers internos para evitar recursión sobre `organization_members`. Las seis RPC públicas de onboarding y gestión de apps/enlaces requieren privilegios elevados para escribir varias tablas en una sola transacción. Todas comprueban `auth.uid()`, fijan `search_path = ''`, revocan acceso a `public` y `anon`, y nunca aceptan un identificador de organización enviado por el cliente. Este uso deliberado queda documentado aunque el asesor de Supabase lo muestre como advertencia genérica. `resolve_smart_link` y las RPC de ingestión solo pueden ejecutarlas `service_role`. La función técnica `rls_auto_enable` tampoco es ejecutable por `anon` ni `authenticated`. La reclamación de postbacks es `SECURITY INVOKER` y también queda restringida al servicio.

## Particionado y retención

La etapa inicial mantiene tablas simples porque los índices únicos globales hacen más segura la idempotencia. Cuando una tabla cruce 100 millones de filas o su mantenimiento mensual exceda la ventana operativa:

1. Crear una tabla nueva particionada por rango mensual.
2. Precrear mes actual y dos futuros; rechazar escrituras sin partición.
3. Copiar por rangos con validación de conteos y checksums.
4. Mantener una tabla compacta de claves idempotentes globales o incluir el mes en la clave de enrutamiento.
5. Cambiar nombres en una migración transaccional y conservar la anterior solo para rollback.
6. Retener clics y eventos crudos 25 meses por defecto; intentos de postback detallados 90 días. La política definitiva será configurable y deberá respetar requisitos legales.
7. Retirar una partición completa, nunca ejecutar un `DELETE` masivo.

## Aplicar de forma reproducible

Requisitos: Supabase CLI fijada por `package-lock.json` y un runtime compatible con Docker.

```bash
npm install
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
npx supabase migration list --local
```

`db reset` recrea la base, aplica todas las migraciones por orden y carga `supabase/seed.sql`. Para un proyecto remoto, enlaza el proyecto correcto y revisa el plan antes de ejecutar `npx supabase db push`.

## Revertir

No se reescribe ni elimina una migración que ya se haya aplicado en un entorno compartido. Se crea otra con:

```bash
npx supabase migration new revert_initial_attruvi_schema
```

La migración inversa debe revocar grants y policies, eliminar funciones/triggers y después tablas en orden inverso de dependencias. Pruébala desde una copia o un entorno de staging con `npx supabase db reset`; en producción, prioriza restauración desde backup/PITR si la migración ya recibió datos. Para desarrollo local sin datos, `npx supabase db reset` vuelve al historial versionado.
