# Modelo de datos

La fuente ejecutable son, en orden, las migraciones de `supabase/migrations/`. No se debe modificar un proyecto remoto a mano.

## Diccionario

| Área | Tablas | Función |
|---|---|---|
| Personas y acceso | `profiles`, `organizations`, `organization_members`, `organization_invitations` | Perfil global, pertenencia con roles owner/admin/viewer e invitaciones de un solo uso con token hasheado |
| Apps | `apps`, `app_platforms`, `public_sdk_keys` | Configuración, identificadores iOS/Android y claves públicas hasheadas/revocables |
| Jerarquía publicitaria | `sources`, `campaigns`, `ad_groups`, `ads` | Fuente → campaña → grupo → anuncio con claves externas y consistencia de tenant |
| Enlaces | `smart_links`, `link_destinations`, `link_clicks` | Configuración, destinos y clics idempotentes |
| Identidad y atribución | `installations`, `identities`, `app_users`, `app_user_installations`, `attribution_rule_sets`, `attribution_candidates`, `attributions` | Instalaciones seudónimas limitadas a una app, unión segura tras `identify`, reglas y decisiones versionadas |
| Actividad e ingresos | `events`, `sessions`, `activity_sessions`, `revenue_ledger`, `revenue_validations`, `subscription_events`, `subscriptions` | Log de transporte, sesiones reconstruibles, contabilidad exacta y estado de suscripción |
| Calidad de usuario | `installation_activity_metrics`, `app_user_metrics`, `push_token_invalidations`, `uninstall_inferences` | Sesiones, actividad, registro, LTV por moneda e inferencias basadas en señales reales |
| Costes | `connector_accounts`, `connector_sync_runs`, `ad_costs`, `ad_cost_mappings`, `private.connector_secrets` | Configuración pública minimizada, jobs, gasto diario, asignaciones y tokens cifrados fuera del esquema expuesto |
| Postbacks | `postback_destinations`, `postback_jobs`, `postback_attempts` | Mapeo y outbox reclamable de forma concurrente |
| Lectura y control | `daily_metrics`, `metric_dirty_days`, `metric_rollup_runs`, `metric_reconciliation_runs`, `development_debug_events`, `audit_log` | Agregados versionados, cola de recálculo, diagnóstico temporal de development y trazabilidad administrativa |

## Reglas estructurales

- Todos los IDs de negocio son UUID. Las tablas que pertenecen a una app incluyen `organization_id` y `app_id`.
- Las claves foráneas compuestas impiden unir filas de distintas organizaciones o apps.
- La jerarquía publicitaria estricta usa FKs compuestas. Las tablas con dimensiones opcionales tienen un trigger que valida tenant y coherencia entre niveles.
- Importes e ingresos son `bigint` en unidades menores y llevan moneda ISO; las ratios se calcularán al consultar, no se almacenan como flotantes.
- `events` tiene unicidad por `event_id` e `idempotency_key`; `revenue_ledger` añade `(app_id, transaction_id, event_type)` y mantiene reembolsos negativos separados.
- `link_clicks` deduplica entregas por `(app_id, dedupe_key)`, distingue bots/pruebas y conserva parámetros de referrer sin guardar la IP ni el agente en claro.
- Los slugs reservados y destinos no HTTPS se rechazan tanto en la interfaz como mediante constraints.
- Los datos operativos son de solo lectura para miembros. La escritura de ingestión, rollups y jobs requiere `service_role`.
- `public_sdk_keys` contiene límites de lote/cuerpo, plataformas, prefijos SDK y política de attestation. La clave se resuelve por SHA-256; el valor legible no se guarda.
- `installations.installation_access_token_hash` protege la lectura puntual de atribución. `identities.identity_hash` evita conservar el identificador externo legible y `traits` pasa por la allowlist/antipII del Worker.
- `resolve_ingest_app_key`, `read_sdk_attribution` e `ingest_sdk_messages_v3` son `SECURITY INVOKER`, están revocadas para `public`, `anon` y `authenticated`, y solo se conceden a `service_role`.
- `events` copia la atribución vigente y sus nombres históricos al procesarse. `revenue_reported_minor`, enviado por el SDK de cualquier app cliente, se atribuye y entra en métricas inmediatamente. Nunca se presenta como `revenue_verified_minor`; la verificación opcional requiere una respuesta futura de App Store, Google Play o RevenueCat.
- Las sesiones fiables viven en `activity_sessions` y se reconstruyen en orden de ocurrencia con el umbral configurable de la app. `sessions` conserva el identificador de transporte del SDK.
- Las atribuciones separan `acquisition` y `reengagement`, usan un `engagement_id` estable y guardan `match_type`, confianza, explicación, ventana en segundos, fecha y versión. Los nombres e IDs externos se copian en la decisión para que un cambio posterior de campaña no reescriba la historia.
- Una sola regla puede estar activa por app. La coincidencia probabilística nace desactivada y el constraint exige base legal documentada antes de activarla.
- Todas las claves externas tienen un índice con las columnas de la relación como prefijo. Esto evita búsquedas completas al unir, actualizar o borrar padres cuando crezcan las tablas de eventos.
- Los costes tienen unicidad por cuenta y `external_row_id`; una corrección del proveedor actualiza importes/contadores y aumenta `correction_version`. `match_status` distingue filas relacionadas, pendientes y asignadas manualmente.
- `connector_sync_runs` conserva ventana, solapamiento, versión de API, cursor, checkpoint, intentos y próximo reintento. `schedule_due_connector_syncs` crea como máximo un trabajo diario abierto por cuenta.
- `private.connector_secrets` solo contiene ciphertext AES-GCM, vector de inicialización y versión de clave. `service_role` es el único rol con RPC de lectura/escritura; la clave maestra reside en secretos del servidor, no en Postgres.
- `daily_metrics` conserva numeradores y denominadores por cohorte, nivel, entorno, plataforma y moneda. `query_metric_rollups` deriva los ratios; `raw_hash`, `metric_version` y `data_through_at` permiten reproducir cada fila.
- `metric_dirty_days` deduplica cambios tardíos por app/entorno/fecha. `metric_rollup_runs` registra rango, versión, frescura, duración y resultado; `metric_reconciliation_runs` conserva conteos y una muestra segura de diferencias.
- `organization_invitations` conserva correo normalizado, rol, expiración y solo el SHA-256 del token. La aceptación exige que el correo de `auth.users` coincida; toda creación, aceptación o modificación de rol deja una entrada en `audit_log`.
- `development_debug_events` solo acepta etapas y estados acotados, metadatos operativos sanitizados y referencias opacas. No almacena propiedades de evento ni identificadores personales y su retención objetivo es siete días.

## RLS

Todas las tablas públicas tienen RLS activado. `anon` no recibe privilegios. Un usuario autenticado puede leer una fila solo cuando `private.is_organization_member(organization_id)` valida su membresía. `owner` y `admin` pueden mutar tablas de configuración; `viewer` no.

Las dos funciones `SECURITY DEFINER` de `private` son helpers internos para evitar recursión sobre `organization_members`. Las RPC públicas de onboarding, apps, enlaces, costes y equipo requieren privilegios elevados para completar operaciones atómicas. Todas comprueban `auth.uid()`, fijan `search_path = ''` y revocan acceso a `public` y `anon`; cuando una RPC acepta una organización, deriva el permiso de una membresía owner validada, nunca confía en ese UUID por sí solo. La lectura del equipo acepta una organización pero exige pertenencia antes de consultar `auth.users`. Las escrituras directas de membresía están revocadas para `authenticated`: los cambios de rol solo pasan por la RPC auditada que protege al último owner. Este uso deliberado queda documentado aunque el asesor de Supabase lo muestre como advertencia genérica. `resolve_smart_link` y las RPC de ingestión solo pueden ejecutarlas `service_role`. La función técnica `rls_auto_enable` tampoco es ejecutable por `anon` ni `authenticated`. La reclamación de postbacks es `SECURITY INVOKER` y también queda restringida al servicio.

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
