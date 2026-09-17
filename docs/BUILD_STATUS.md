# Estado de construcción

Actualizado: 2026-09-17.

## Completado

- La landing Next.js permanece en la raíz y conserva sus scripts originales.
- Workspaces ejecutables para core, SDK React Native, conectores y dos Workers.
- Contratos TypeScript con IDs opacos, fechas UTC, eventos reservados y dinero exacto.
- Workers con configuración versionada, tipos generados por Wrangler, observabilidad y pruebas en el runtime de Cloudflare.
- Modelo Supabase completo mediante migración versionada, RLS de denegación por defecto, claves idempotentes, seeds ficticios y pgTAP.
- Autenticación Supabase completa con Google OAuth PKCE, correo/contraseña, verificación, reenvío con enfriamiento, recuperación, nueva contraseña y cierre de sesión.
- Sesiones SSR para Next.js 16 mediante `proxy.ts`, validación con `getClaims()`, callback seguro y protección redundante de dashboard, onboarding y APIs privadas.
- Creación atómica de perfil, organización personal y membresía owner; onboarding reanudable para la primera app sin pedir credenciales publicitarias.
- Dashboard inicial conectado al modelo real de métricas y compatible con el dataset ficticio de seeds.
- Sección multiapp para crear y editar apps iOS/Android con identificadores, moneda, zona horaria y estado.
- Constructor no técnico de enlaces con fuente, jerarquía publicitaria, UTM, afiliado/creador, deep link, destinos, slug y ventana de atribución.
- Listado para copiar, probar, editar, activar y desactivar enlaces, con clics válidos separados por plataforma.
- Worker de enlaces completo con redirect HTTP inmediato, KV, Queue, RPC de resolución, Play Install Referrer, AASA/assetlinks, bots, deduplicación y adaptador local.
- Auditoría de licencia/arquitectura de Link My App e implementación nueva sin copiar sus datos o acoplamientos.
- Documentación de arquitectura, taxonomía, modelo de datos, particionado, retención y rollback.
- SDK abierto `@attruvi/react-native` con la API pública completa, identificadores seguros nativos, consentimiento, sesiones automáticas, cola offline, lotes, backoff con jitter, idempotencia, deep links y Play Install Referrer.
- Módulo autovinculable en Kotlin/Swift, compatible por peer range con React Native 0.86.3–0.87.x y cargado por `TurboModuleRegistry` mediante la interoperabilidad de New Architecture.
- App aislada basada en la plantilla oficial React Native 0.87 con botones de instalación simulada, registro, compra y suscripción.
- Guías humanas y prompt breve para Codex/ChatGPT/Claude, incluida la limitación real de Expo Go.
- Worker público de ingestión con `/v1/installations`, `/v1/events/batch`, `/v1/identify`, `/v1/attribution` y `/health`, contratos compartidos, límites de cuerpo/lote/reloj/PII, cuotas por IP y app, y extensión cerrada para App Attest/Play Integrity.
- Cloudflare Queue con consumo de hasta 50 mensajes por RPC, reintentos con backoff, DLQ sanitizada, métricas `accepted/rejected/queued/persisted/lag` y caché KV de appKey revocable.
- Persistencia Supabase idempotente de instalaciones, identidades hasheadas, sesiones, eventos, compras y suscripciones; prueba de instalación separada para la única lectura pública.
- Motor de atribución versionado con prioridad de evidencia, adquisición/reactivación separadas, last non-organic click, fallback orgánico, candidatos puntuados, explicación, snapshots históricos y corrección manual auditada.
- Comparación `dry-run` para versiones nuevas, coincidencia probabilística cerrada por defecto y limitada a consentimiento, base legal, dos hashes salados y ventana corta.
- Sección `/dashboard/attribution` con regla activa, confianza, motivo ganador y candidatos evaluados por instalación o sesión.
- Procesamiento fiable de `install`, aperturas, sesiones, registro, compras, reembolsos y todo el ciclo de suscripción mediante `ingest_sdk_messages_v3`.
- Perfiles anónimos con unión explícita tras `identify`, reinstalaciones del mismo usuario, conflicto cerrado entre identidades distintas y borrado de identificadores sin romper el historial contable.
- Sesiones reconstruibles con 30 minutos de inactividad por defecto y selector configurable por app; los eventos atrasados no dependen del orden de Queue.
- Libro mayor idempotente con revenue declarado/verificado separado, monedas independientes, reembolsos negativos e interfaz futura para App Store, Google Play y RevenueCat.
- Métricas por instalación y usuario: sesiones, actividad, registro, primera compra, payer status, días desde instalación e LTV observado.
- `uninstall_inferred` restringido a invalidaciones push persistentes del backend, con fecha, evidencia minimizada y confianza; el SDK no puede declararlo.
- Explorador `/dashboard/users` paginado y filtrado en servidor, con línea temporal clic → instalación → sesiones → ingresos → postbacks y sin PII.
- Arquitectura común de conectores con Google Ads API `v25`, Meta Marketing API `v26.0`, TikTok Marketing API `v1.3` y entrada manual diaria, por rango o CSV.
- OAuth server-side, descubrimiento de cuentas, tokens AES-256-GCM fuera del esquema expuesto, estados recuperables y una interfaz que solo revela nombre, estado, último sync y sufijo no sensible.
- Jobs incrementales diarios con cursor, tres días de solapamiento, reclamación concurrente, paginación, backoff, deduplicación y correcciones tardías versionadas.
- Gasto exacto en unidades menores y moneda original, jerarquía por `external_id`, campañas eliminadas históricas y bandeja **Sin relacionar** con asignación manual auditada.
- Sección `/dashboard/costs` para conectar Google/Meta/TikTok, consultar estados, encolar sync y añadir costes manuales sin bloquear el producto cuando falten credenciales externas.
- Motor reproducible por día, entorno, plataforma, moneda y niveles app/fuente/campaña/grupo/anuncio, con CPI, CAC, ROAS, conversiones, retención, sesiones, LTV observado y desinstalación siempre inferida.
- Rollups incrementales con fechas sucias, reclamación concurrente, versiones, conservación raw, recálculo tardío y reconciliación por hash.
- Consultas server-side filtrables y caché por app con invalidación inmediata; el navegador no descarga eventos raw.
- Dashboard conectado a los agregados con filtros de periodo, entorno y plataforma.
- Dashboard principal completo con Resumen, Adquisición, Campañas, Usuarios, Enlaces, Eventos, Postbacks, Integraciones y Ajustes, manteniendo el lenguaje visual de la landing.
- Resumen con nueve KPIs y comparación contra un periodo anterior equivalente, gráfico diario de gasto/ingresos, ranking real de anuncios y estados de datos completos, parciales, sincronizando o sin costes.
- Campañas con jerarquía campaña → grupo → anuncio, filtros compartibles por slug, ordenación de todas las métricas, comparación local de hasta cuatro elementos, detalle accesible y paginación desde el servidor.
- Selector persistente de app/entorno, contexto multiempresa aislado por RLS, formatos por moneda/zona horaria y estados reales de carga, vacío, error, permisos y credenciales pendientes.
- Gestión de equipo owner/admin/viewer mediante invitaciones de un solo uso: solo se almacena SHA-256 del token, el correo autenticado debe coincidir y las escrituras directas de membresía están revocadas para impedir saltarse la auditoría o el último owner.
- `docs/METRICS.md`, fixture exacto de 33 assertions y benchmark de un millón de hechos sintéticos.
- OpenAPI, ejemplos ficticios, entorno local con Miniflare, adaptador en memoria exclusivo de pruebas y prueba de carga medida.
- Todas las migraciones aplicadas al proyecto Supabase Attruvi. Las 55 claves externas cuentan con índice de cobertura y la función técnica de auto-RLS no es ejecutable por `anon` ni `authenticated`.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.
- `npm run test:schema`: contrato estructural de migración/seeds sin necesitar Docker.
- `npm run test:web`: registro, verificación, contraseña incorrecta, recuperación, Google OAuth simulado, callback seguro y clasificación de rutas privadas.
- `npm run test:db`: aislamiento RLS e invariantes en Postgres local; necesita `supabase start` y Docker.

En esta ejecución pasó `npm run verify`: lint, typecheck de raíz y cinco workspaces, 25 pruebas web, 51 pruebas de workspaces, contrato estructural SQL y builds de producción de Next.js, los paquetes y ambos Workers. El Worker de ingestión aporta 11 pruebas, incluida la garantía de que la señal probabilística solo se añade habilitada, nunca encola IP/agente en claro y rechaza una desinstalación enviada por el SDK. El build incluye el dashboard completo, sus nueve destinos principales, `/invite/[token]` y el cron `/api/cron/metrics`; el Worker de enlaces mantiene sus 13 pruebas de redirects, Unicode, Install Referrer, destinos, bots, deduplicación, abuso y asociaciones nativas.

Las suites pgTAP tienen 137 assertions. Aunque `npm run test:db` local no estuvo disponible porque este equipo no tiene Docker, las 24 assertions de esquema, 21 del motor de atribución, 23 de actividad, 24 de costes, 33 del motor de métricas y 12 de acceso al dashboard pasaron contra el proyecto Supabase Attruvi dentro de transacciones revertidas. Además cubren dinero exacto, división por cero, aislamiento RLS, retención y LTV maduros, reembolsos, datos tardíos, reconciliación, preservación raw, invitaciones, roles y bloqueo de escrituras directas de membresía.

El benchmark SQL del 17-09-2026 expandió 1.000.000 de hechos a 5.000.000 de filas y 80.370 grupos en 5,335 s en Supabase, con 7,1 MB de memoria de hash y 36 MB temporales. Mide el núcleo sintético de agrupación, no garantiza latencia end-to-end.

La prueba de carga local más reciente aceptó 5.000/5.000 solicitudes con concurrencia 100 en 1.025 ms: 4.878,05 solicitudes/s, p50 13 ms y p95 27 ms. Mide validación, controles y cola en memoria; no se presenta como rendimiento de red de Cloudflare o Supabase.

Los asesores remotos de Supabase no reportan claves externas sin índice ni nuevas alertas RLS. Permanecen quince advertencias esperadas por RPC autenticadas `SECURITY DEFINER`: las once anteriores y las cuatro operaciones de equipo, todas justificadas en `DECISIONS.md`; también índices aún “sin uso” porque la base está recién creada y el ajuste externo del pool de Auth.

La fase del SDK superó TypeScript estricto con los tipos de React Native 0.87, 9 pruebas unitarias y `npm pack`. El tarball generado se instaló en una app limpia RN 0.87 con `newArchEnabled=true`; el autolinking detectó Android e iOS. La compilación Android no pudo ejecutarse porque este equipo no tiene JDK ni Android SDK, y la compilación iOS requiere macOS/Xcode.

## Pendiente de fases posteriores

- Credenciales de desarrollador y aprobación externa de Google Ads, Meta Ads y TikTok Ads; los conectores quedan implementados y muestran “Pendiente de credenciales” hasta recibirlas.
- Envío final de postbacks de conversión a las redes en producción.
- Verificadores oficiales de App Attest y Play Integrity; el contrato está preparado pero no se marca ningún token como verificado todavía.
- Credenciales y conectores de validación de recibos para App Store, Google Play o RevenueCat; hasta entonces los ingresos se muestran como declarados, no verificados.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.

## Configuración externa pendiente

- Añadir en Supabase las URLs de `docs/AUTH_SETUP.md`, activar Google con su Client ID/Secret y configurar un SMTP de producción.
- Añadir las variables públicas de Supabase a los entornos de Vercel. No se requieren secretos de Google en el navegador.
- Crear KV/Queues, configurar los tres secretos del Worker y asociar el dominio de enlaces siguiendo `docs/SMART_LINKS_CLOUDFLARE.md`.
- Para publicar ingestión en Cloudflare: elegir la cuenta destino, crear su KV y sus dos Queues, y cargar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `CLICK_HASH_SALT` como secretos. El salt debe coincidir con el del Worker de enlaces. Ningún valor está disponible en el repositorio ni se ha inventado o expuesto.
- Añadir las asociaciones reales de cada app a `association-config.ts` y comprobar Universal Links/App Links en dispositivos.
- Compilar la app de ejemplo en Android y iOS en un host con JDK/Android SDK y Xcode, respectivamente.
- Añadir `CONNECTOR_ENCRYPTION_KEY`, `CRON_SECRET` y las credenciales publicitarias de `docs/AD_COST_CONNECTORS.md` a Vercel; registrar las tres callbacks. No hay valores reales en el repositorio.
