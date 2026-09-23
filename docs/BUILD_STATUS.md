# Estado de construcción

Actualizado: 2026-09-17.

## Estado operativo de la release

- Web y dashboard en producción: `https://www.attruvi.com`; `https://attruvi.com` redirige permanentemente a `www`.
- Release web activa desde la rama `main`; el deployment exacto se consulta en Vercel para evitar dejar aquí un identificador obsoleto tras cada despliegue.
- Enlaces e ingestión: Workers de producción `attruvi-links` y `attruvi-ingest`; sus URLs se inyectan mediante variables de entorno y no se fijan en el repositorio público.
- Staging conservado mediante el alias del proyecto Vercel y los Workers `attruvi-links-staging` / `attruvi-ingest-staging`; los hosts se obtienen del gestor de despliegues, no del código.
- `/api/health?deep=1` comprueba desde Vercel los dos Workers. Tras rotar y revocar las claves anteriores devolvió HTTP 200 y estado `ok` para web, links e ingest.
- Supabase producción tiene todas las migraciones aplicadas, RLS activo en todas las tablas públicas y redirect URLs de `www.attruvi.com` configuradas. La rama de staging ejecutó nueve suites pgTAP y el E2E sintético exacto.
- Google OAuth está activo en Supabase y publicado para usuarios externos. La ficha pública usa `attruvi.com`, sus páginas de privacidad/términos y un correo de soporte; el secreto permanece fuera del repositorio.
- El onboarding de apps iOS/Android está corregido y verificado en producción: una repetición conserva una app y exactamente una plataforma por sistema operativo.
- Vercel ejecuta costes a diario, métricas a diario, privacidad a diario y postbacks cada cinco minutos. Cloudflare tiene KV, Queue, DLQ, logs y trazas activos.
- Escritorio y viewport móvil de 390 px pasan sin overflow ni errores de consola. La landing responde 200, el dominio raíz 308 y `/dashboard` sin sesión 307 hacia el acceso.
- El traspaso a macOS es reproducible mediante `.nvmrc`, `docs/MACBOOK_SETUP.md` y `npm run bootstrap:macos`; GitHub conserva el código y los secretos permanecen en los almacenes de cada proveedor.

La infraestructura principal está desplegada y es verificable, pero el producto **no se marca aún como listo para integrar en apps reales**: faltan verificadores activos de App Attest/Play Integrity, credenciales y aprobación de las redes, SMTP de producción, validación nativa iOS y revisión jurídica. El dominio de smart links sigue en `workers.dev` hasta que `attruvi.com` pueda asociarse a una zona de Cloudflare sin cambiar DNS ajeno.

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
- Perfiles seudónimos limitados a una app con unión explícita tras `identify`, reinstalaciones del mismo usuario, conflicto cerrado entre identidades distintas y borrado de identificadores sin romper el historial contable.
- Sesiones reconstruibles con 30 minutos de inactividad por defecto y selector configurable por app; los eventos atrasados no dependen del orden de Queue.
- Libro mayor idempotente con revenue declarado/verificado separado, monedas independientes, reembolsos negativos e interfaz futura para App Store, Google Play y RevenueCat.
- Las apps reales citadas en la matriz son únicamente fixtures aislados de compatibilidad. Attruvi no las incorpora: cualquier cliente crea sus propias apps y envía compras, suscripciones y reembolsos mediante eventos del SDK.
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
- Las lecturas de métricas usan caché de servicio cuando existe una identidad server-side y caen de forma segura al cliente autenticado con RLS cuando Vercel no dispone de esa clave; el dashboard no deja de funcionar por una optimización opcional.
- La verificación visual autenticada cubre Resumen y Campañas a 1440 px, Resumen móvil a 390 px, navegación por teclado y ausencia de overflow; el gráfico usa un título SVG estable para hidratar sin diferencias entre servidor y navegador.
- Gestión de equipo owner/admin/viewer mediante invitaciones de un solo uso: solo se almacena SHA-256 del token, el correo autenticado debe coincidir y las escrituras directas de membresía están revocadas para impedir saltarse la auditoría o el último owner.
- Pipeline de postbacks server-side con adaptadores fijados a Google Ads `v25`, Meta `v26.0` y TikTok `v1.3`, elegibilidad por consentimiento y click ID real, y valor/moneda configurables.
- Outbox transaccional desde `events`, reclamación con lease y `SKIP LOCKED`, event ID estable, ocho intentos, `Retry-After`, backoff con jitter, renovación de Google/TikTok, dead-letter y replay owner/admin auditado.
- Pruebas de configuración sin conversiones productivas: `validate_only` de Google, Test Events de Meta y validación read-only/local de TikTok; ningún conector inventa un identificador.
- Panel de postbacks con mapeos, pausa/activación, credenciales pendientes, volumen, éxito, latencia p95, códigos de error, último envío, historial anonimizado y replay.
- Clientes falsos estrictos y fixtures para éxito, duplicado, rate limit, token caducado, campo rechazado, caída de red, consentimiento ausente y refresh de TikTok.
- Asistente `/dashboard/setup` por app con ocho pasos, estado automático, copy no técnico, prompts específicos para Codex/ChatGPT/Claude y `ATTRUVI_SETUP.md` descargable.
- Creación y rotación atómica de appKey pública de development: el valor completo se muestra una sola vez y Postgres conserva únicamente SHA-256, prefijo y auditoría.
- Debugger en vivo de development con trazas anonimizadas de clic, validación, Queue, primera apertura, atribución, evento y postback dry-run; las simulaciones nunca son reclamables por el worker productivo.
- Diagnóstico automático de bundle/package IDs, AASA/assetlinks, endpoint, versión del SDK y último evento, con acciones concretas y snippets separados para React Native bare y Expo development build.
- `docs/METRICS.md`, fixture exacto de 33 assertions y benchmark de un millón de hechos sintéticos.
- OpenAPI, ejemplos ficticios, entorno local con Miniflare, adaptador en memoria exclusivo de pruebas y prueba de carga medida.
- Fase específica de seguridad y privacidad: escaneo redactado de árbol e historial, validación estricta de entorno, separación SDK/servidor, llavero OAuth versionado, estados OAuth de un uso, protección HMAC contra replay administrativo, CSP/cabeceras, auditoría de cambios, finalidades de consentimiento y retención por app.
- Exportación paginada de app/perfil sin material de credenciales, borrado/seudonimización conservando hechos contables, cron de retención, páginas legales marcadas como borradores y documentación pública MIT/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/despliegue propio.
- CI de secret scanning y dependencias, threat model de enlaces/ingestión/OAuth/postbacks/multi-tenant y 21 pruebas negativas pgTAP de privacidad y RLS.
- Todas las migraciones aplicadas al proyecto Supabase Attruvi. Las 55 claves externas cuentan con índice de cobertura y la función técnica de auto-RLS no es ejecutable por `anon` ni `authenticated`.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.
- `npm run test:schema`: contrato estructural de migración/seeds sin necesitar Docker.
- `npm run test:web`: registro, verificación, contraseña incorrecta, recuperación, Google OAuth simulado, callback seguro, clasificación de rutas privadas y generación segura de la guía de instalación.
- `npm run test:db`: aislamiento RLS e invariantes en Postgres local; necesita `supabase start` y Docker.

En esta ejecución pasaron lint, typecheck de raíz y cinco workspaces, 40 pruebas web, 65 pruebas de workspaces, contrato estructural SQL y builds de los paquetes y ambos Workers: 105 pruebas JavaScript/TypeScript en total. El build de Next.js 16 pasa tanto en local (con Webpack para garantizar compatibilidad con enlaces simbólicos/junctions) como en remoto en Vercel, optimizando y generando estáticamente las 30 rutas de la aplicación. El Worker de ingestión aporta 13 pruebas, incluida la garantía de que la señal probabilística solo se añade habilitada, nunca encola IP/agente en claro y rechaza una desinstalación enviada por el SDK. El Worker de enlaces mantiene 15 pruebas de redirects, Unicode, Install Referrer, destinos, bots, deduplicación, abuso y asociaciones nativas. Las 21 assertions pgTAP de seguridad/privacidad pasan contra el Supabase remoto; las suites históricas que dependen del seed Demo requieren cargar primero `supabase/seed.sql` en ese entorno.

Las suites pgTAP tienen 194 assertions. Aunque `npm run test:db` local no estuvo disponible porque este equipo no tiene Docker, las verificaciones remotas registradas cubren 24 assertions de esquema, 21 del motor de atribución, 23 de actividad, 24 de costes, 33 del motor de métricas, 12 de acceso al dashboard, 24 del pipeline de postbacks, 12 del asistente y 21 de seguridad/privacidad, siempre dentro de transacciones revertidas. Además cubren dinero exacto, división por cero, aislamiento RLS, retención y LTV maduros, reembolsos, datos tardíos, reconciliación, preservación raw, invitaciones, roles, OAuth de un uso, exportación/borrado, outbox, deduplicación, replay auditado, pruebas de development y bloqueo de escrituras directas. Las suites que usan fixtures Demo deben ejecutarse después de cargar el seed reproducible.

El benchmark SQL del 17-09-2026 expandió 1.000.000 de hechos a 5.000.000 de filas y 80.370 grupos en 5,335 s en Supabase, con 7,1 MB de memoria de hash y 36 MB temporales. Mide el núcleo sintético de agrupación, no garantiza latencia end-to-end.

La prueba de carga local más reciente aceptó 5.000/5.000 solicitudes con concurrencia 100 en 1.025 ms: 4.878,05 solicitudes/s, p50 13 ms y p95 27 ms. Mide validación, controles y cola en memoria; no se presenta como rendimiento de red de Cloudflare o Supabase.

Los asesores remotos de Supabase no reportan claves externas sin índice ni nuevas alertas RLS, y no registran riesgos altos o críticos. Permanece una advertencia agrupada con 24 RPC autenticadas `SECURITY DEFINER`, todas con comprobación explícita de sesión/pertenencia, `search_path` fijado y justificación en `DECISIONS.md`; también aparecen índices aún “sin uso” porque la base está recién creada y el ajuste externo del pool de Auth.

La fase del SDK superó TypeScript estricto, `npm pack`, 12 pruebas (incluido el E2E objetivo) y compilación Android arm64 con React Native 0.87/New Architecture. El tarball se compiló además dentro de Tourixy, Solsuna y Rutimon en ramas o worktrees aislados: Tourixy RN 0.87 bare, Solsuna Expo 57/RN 0.86.3 y Rutimon Expo 57/RN 0.86.3. La validación corrigió en el SDK el acceso Kotlin a `context.currentActivity`; no parcheó las apps para ocultar el problema. iOS sigue pendiente porque este host Windows no dispone de Xcode.

El E2E sintético enlaza un clic TikTok con Install Referrer, primera apertura, `sign_up`, compra de 49,90 EUR, coste de 10,00 EUR, CPI/CAC de 10,00 EUR, ROAS 4,99 y tres decisiones de postback: TikTok elegible en validación local, Google omitido sin click ID propio y Meta omitido sin `fbclid`. También cubre offline/reintento, duplicados, dos organizaciones, ausencia de consentimiento y fallos temporales. La matriz y hashes reproducibles están en `docs/APP_COMPATIBILITY.md`.

## Pendiente de integraciones externas

- Credenciales de desarrollador y aprobación externa de Google Ads, Meta Ads y TikTok Ads; los conectores quedan implementados y muestran “Pendiente de credenciales” hasta recibirlas.
- Credenciales reales, IDs de conversión/dataset/event source y aprobación de los tres proveedores para activar postbacks en producción; el código queda funcional y en “Pendiente de credenciales” hasta entonces.
- Verificadores oficiales de App Attest y Play Integrity; el contrato está preparado pero no se marca ningún token como verificado todavía.
- Validación opcional de recibos con App Store, Google Play o RevenueCat. No bloquea la atribución ni las métricas: los eventos del SDK ya producen ingresos reportados; esta integración futura solo permitiría marcarlos además como verificados.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.

## Configuración externa pendiente

- Configurar un SMTP de producción para la verificación y recuperación por correo. Google Auth y las redirect URLs de Attruvi ya están activos en producción.
- Asociar un dominio estable de Attruvi a los Workers cuando pueda hacerse sin mover ni alterar DNS ajeno; mientras tanto se usan las URLs `workers.dev` verificadas.
- Añadir las asociaciones reales de cada app a `association-config.ts` y comprobar Universal Links/App Links en dispositivos.
- Compilar y validar iOS en un host con Xcode; Android RN 0.87/New Architecture y los tres fixtures objetivo ya pasan.
- Añadir únicamente las credenciales publicitarias de `docs/AD_COST_CONNECTORS.md` y registrar las callbacks. El llavero de cifrado y `CRON_SECRET` ya están configurados en Vercel; no hay valores reales en el repositorio.
