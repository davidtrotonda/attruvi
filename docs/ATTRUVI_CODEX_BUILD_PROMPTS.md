# Attruvi: 16 prompts para construir la plataforma completa con Codex

Este documento está pensado para ejecutar los prompts **en orden y dentro de la misma tarea de Codex**, usando GPT‑5.6 Sol con razonamiento muy alto. Cada prompt debe terminar con código funcional, pruebas y un commit; no avances al siguiente mientras el anterior tenga errores reales.

## Cómo utilizar este documento

1. Abre el repositorio de Attruvi como proyecto en Codex.
2. Envía primero el **Prompt maestro** una sola vez.
3. Envía después los prompts 1–16, uno por uno.
4. Revisa el resumen y las pruebas de cada fase antes de continuar.
5. Si todavía faltan credenciales de Google, Meta o TikTok, Codex debe terminar igualmente el conector, sus pruebas, la interfaz y la validación de configuración. Solo debe quedar pendiente introducir la credencial y activar el proveedor.
6. Mantén todos los prompts en la misma tarea para que Codex conserve las decisiones y el estado del repositorio.

## Resultado que debe existir al terminar

- Panel web multiapp con acceso mediante Google y correo/contraseña.
- Verificación de correo, recuperación de contraseña y diálogo de acceso completo.
- Proyectos separados para Tourixy, Solsuna, Rutimon y futuras apps.
- Enlaces inteligentes sin página intermedia visible.
- Atribución de fuente, campaña, grupo y anuncio cuando las señales disponibles lo permitan.
- SDK abierto para React Native, probado contra la arquitectura real de las apps.
- Eventos de apertura, sesión, registro, compra y suscripción.
- Gasto automático de Google Ads, Meta Ads y TikTok Ads, además de costes manuales.
- Métricas CPI, CAC, ROAS, retención, ingresos y LTV.
- Envío de conversiones y valor a las redes publicitarias.
- Infraestructura en Vercel, Supabase y Cloudflare.
- Repositorio público sin secretos, identificadores privados ni datos personales.

## Límites reales que el producto debe explicar

La herramienta no debe prometer una atribución exacta cuando el sistema operativo o la plataforma publicitaria no entrega una señal determinista. Android puede utilizar Install Referrer y parámetros de clic; iOS tiene más restricciones y puede necesitar señales oficiales de la red o una coincidencia probabilística limitada y consentida. Las desinstalaciones solo pueden inferirse cuando exista una señal válida, por ejemplo la invalidación de un token push. Cada atribución debe guardar el método, la confianza y la evidencia utilizada.

---

## Prompt maestro — reglas permanentes

~~~text
Trabaja en el repositorio actual de Attruvi hasta completar cada petición de forma real. Lee primero AGENTS.md, CLAUDE.md, README.md, package.json y la documentación que ya exista. No sustituyas ni rompas la landing pública actual.

Estas reglas se aplican a todo el proyecto:

- Attruvi es una plataforma de atribución y analítica móvil de código abierto, inicialmente solo para aplicaciones React Native.
- La interfaz debe estar escrita para usuarios no técnicos que construyen sus apps con Codex, ChatGPT o Claude. Evita jerga sin explicación.
- Conserva la web en Next.js y el despliegue actual en Vercel. Usa Supabase para Postgres y autenticación. Usa Cloudflare Workers para los enlaces inteligentes y para las rutas de ingestión que necesiten baja latencia.
- Diseña un producto multiempresa y multiapp aunque inicialmente lo use una sola persona. Toda fila debe quedar aislada por organización y aplicación.
- Nunca muestres, imprimas, subas ni confirmes valores de claves, tokens, cookies, secretos OAuth, identificadores privados o datos reales de usuarios. Usa variables de entorno, secretos del proveedor y archivos .env.example únicamente con nombres y valores ficticios.
- Ningún secreto de servidor puede llegar al navegador o al SDK móvil. Las claves públicas del SDK deben ser revocables, limitadas por app y tratadas como identificadores públicos, no como secretos.
- No inventes que una integración funciona. Si falta acceso o una credencial externa, termina la implementación, las pruebas con fixtures oficiales y la pantalla de configuración; marca el proveedor como “Pendiente de credenciales”.
- No dejes mocks activos en producción ni TODO vacíos en el camino principal. Los mocks solo pueden existir en pruebas o en un modo demo claramente identificado.
- Respeta ATT, consentimiento, SKAdNetwork/Privacy Sandbox y las políticas vigentes de Apple, Google y las redes. No uses fingerprinting oculto.
- Implementa idempotencia, deduplicación, reintentos con backoff, límites de frecuencia, auditoría y estados de error recuperables donde haya eventos o llamadas externas.
- Después de cada cambio ejecuta las pruebas relevantes, typecheck, lint si está configurado y build. Corrige los fallos causados por tu trabajo.
- Mantén docs/BUILD_STATUS.md con una lista verificable de lo completado, lo pendiente y las decisiones. Mantén docs/DECISIONS.md con ADR breves.
- Al terminar cada prompt, crea un commit pequeño y descriptivo. No mezcles cambios ajenos, no borres trabajo existente y no publiques secretos.
- En el mensaje final indica: resultado, pruebas ejecutadas, commit, riesgos conocidos y qué credenciales externas faltan. No te limites a explicar o planificar: implementa.
~~~

---

## Prompt 1 — arquitectura ejecutable y base del repositorio

~~~text
Convierte el repositorio actual de Attruvi en la base ejecutable de la plataforma sin romper la landing ni el dominio existente.

Primero audita la estructura, dependencias, despliegue y cambios locales. Escribe docs/ARCHITECTURE.md con un diagrama textual del flujo completo:

anuncio → enlace Attruvi → clic → tienda o app → primera apertura → atribución → eventos → ingresos → métricas → postback a la red.

Mantén la aplicación Next.js en su ubicación actual para no romper Vercel. Añade workspaces ligeros para:

- packages/core: tipos, esquemas y lógica compartida sin dependencias del navegador.
- packages/react-native: futuro SDK público.
- packages/connectors: contratos para redes publicitarias.
- workers/links: Cloudflare Worker de enlaces inteligentes.
- workers/ingest: Cloudflare Worker de ingestión.
- supabase/migrations y supabase/seed.sql.

No implementes todavía toda la lógica, pero cada paquete debe compilar y tener una prueba mínima real. Define contratos TypeScript con identificadores opacos para Organization, App, Source, Campaign, AdGroup, Ad, SmartLink, Click, Installation, Attribution, Event y Postback. Usa esquemas de validación compartidos en los límites de red y fechas UTC.

Crea docs/EVENT_TAXONOMY.md con los eventos reservados: install, app_open, session_start, sign_up, purchase, subscription_started, subscription_renewed, subscription_cancelled y uninstall_inferred. Define propiedades obligatorias, opcionales, moneda ISO, valor entero en unidades menores y reglas de idempotencia.

Añade scripts raíz para build, typecheck, test y verificación de todos los workspaces. Conserva los scripts actuales de la landing. Actualiza .gitignore y .env.example sin valores reales.

La fase termina solo si:

1. La landing sigue compilando y sirviéndose.
2. Todos los workspaces compilan.
3. Hay pruebas de los contratos centrales.
4. La arquitectura explica responsabilidades, límites de confianza y flujo de datos.
5. BUILD_STATUS y DECISIONS quedan actualizados.
~~~

---

## Prompt 2 — modelo de datos de Supabase, RLS y datos de demostración

~~~text
Implementa el modelo Postgres de Attruvi mediante migraciones versionadas de Supabase. No hagas cambios manuales imposibles de reproducir.

Modela como mínimo:

- organizations, organization_members y profiles.
- apps y app_platforms, con bundle id de iOS, package name de Android, zona horaria y moneda.
- public_sdk_keys con hash, prefijo visible, estado, entorno y fecha de revocación.
- sources, campaigns, ad_groups y ads.
- smart_links y link_destinations.
- link_clicks, installations, identities, attribution_candidates y attributions.
- events, sessions, purchases y subscriptions.
- connector_accounts, connector_sync_runs y ad_costs.
- postback_destinations, postback_jobs y postback_attempts.
- daily_metrics y audit_log.

Todas las tablas deben tener UUID, created_at, updated_at cuando proceda, organization_id y app_id cuando corresponda. Usa claves externas, constraints, índices compuestos y unicidad que protejan idempotencia. Para tablas de gran volumen diseña particionado temporal o documenta una estrategia concreta de particionado y retención compatible con Supabase. El dinero debe almacenarse como bigint en unidades menores y currency ISO; nunca como float.

Implementa RLS de denegación por defecto. Los miembros solo pueden leer la organización a la que pertenecen; owner y admin administran configuración; las escrituras de ingestión y jobs usan una identidad de servicio exclusiva. Ninguna policy debe aceptar organization_id enviado por el cliente sin derivarlo de una pertenencia validada.

Crea funciones SQL/RPC seguras únicamente cuando simplifiquen operaciones atómicas como registrar un lote idempotente o reclamar trabajos pendientes. Evita SECURITY DEFINER salvo necesidad demostrada, fija search_path y prueba el aislamiento.

Añade seeds totalmente ficticios para una organización “Demo”, una app React Native, campañas de Google/Meta/TikTok, afiliado, influencer y orgánico, incluyendo clics, instalaciones, compras y costes.

Crea pruebas que demuestren:

- un usuario de una organización no puede leer ni modificar otra;
- dos reintentos del mismo evento no duplican datos;
- las relaciones campaña → grupo → anuncio son válidas;
- los cálculos monetarios no pierden precisión;
- los seeds permiten mostrar un dashboard útil.

Genera docs/DATA_MODEL.md con el diccionario de datos y un procedimiento reproducible para aplicar y revertir migraciones.
~~~

---

## Prompt 3 — autenticación completa y onboarding no técnico

~~~text
Implementa en la aplicación Next.js la autenticación completa con Supabase Auth y un onboarding claro para usuarios no técnicos.

Usa como referencia de comportamiento, si está disponible en el equipo, el diálogo de autenticación de Tourixy: apps/web/src/components/auth-dialog.tsx y apps/web/src/app/auth/confirm/route.ts. No copies marca, secretos ni código sin revisar; reutiliza el patrón de experiencia.

El botón “Entrar” debe abrir un diálogo accesible y responsive, sin sacar al usuario de la página. Debe incluir:

- entrar con Google mediante OAuth PKCE;
- registro con nombre, correo y contraseña;
- acceso con correo y contraseña;
- confirmación explícita de que se ha enviado el correo de verificación;
- reenvío de verificación con enfriamiento;
- “He olvidado mi contraseña”;
- pantalla para establecer una contraseña nueva al volver desde el enlace;
- cerrar sesión;
- estados de carga, éxito y errores comprensibles;
- protección frente a enumeración de cuentas y envíos repetidos.

Implementa las rutas callback/confirm/reset necesarias y valida el parámetro next para evitar redirecciones abiertas. Configura el middleware y las sesiones SSR de forma compatible con la versión actual de Next.js y Supabase. El dashboard y las APIs privadas deben requerir sesión; la landing, enlaces públicos y documentación siguen siendo públicos.

En el primer acceso crea o recupera de forma atómica el profile, una organización personal y su membresía owner. El onboarding debe pedir solo:

1. nombre del proyecto;
2. nombre de la app;
3. iOS, Android o ambos;
4. bundle id/package name;
5. moneda y zona horaria.

No pidas todavía credenciales publicitarias. Permite salir y continuar después. Añade rutas protegidas /dashboard y /onboarding con una pantalla inicial real basada en los seeds.

Incluye pruebas de registro, verificación, contraseña incorrecta, recuperación, callback seguro, acceso Google simulado y protección de rutas. Documenta las redirect URLs exactas que deberán añadirse a Supabase y Google, sin incluir valores secretos.
~~~

---

## Prompt 4 — aplicaciones, claves públicas y enlaces inteligentes sin pantalla intermedia

~~~text
Construye el sistema completo de aplicaciones y enlaces inteligentes de Attruvi.

Antes de programar, localiza el proyecto Link My App del mismo propietario, en local o en GitHub. Audita su licencia, estructura, Worker y modelo de enlace. Reutiliza únicamente código que sea compatible y útil; elimina cualquier secreto, identificador de cuenta, dominio privado, dato personal o acoplamiento a su base. Si no puedes acceder al código, reproduce el comportamiento a partir de contratos nuevos y documenta la diferencia.

En el dashboard crea una sección “Apps” y un constructor de enlaces con lenguaje no técnico. Cada enlace debe aceptar:

- app y plataforma de destino;
- tipo de origen: Google Ads, Meta Ads, TikTok Ads, afiliado, influencer, orgánico u otro;
- utm_source, utm_medium, utm_campaign, utm_content y utm_term;
- campaign_id/nombre, ad_group_id/nombre y ad_id/nombre;
- affiliate_id o creator_id opcional;
- ruta interna/deep link opcional;
- URL de App Store, Google Play y fallback web;
- slug editable, estado y ventana de atribución.

Implementa workers/links como Cloudflare Worker. El enlace público debe responder sin página intermedia visible: si el sistema operativo abre la app mediante Universal Link/App Link, el SDK recibe la URL; si no, el Worker registra el clic y devuelve inmediatamente un redirect HTTP a la tienda o fallback. No renderices una pantalla de “redirigiendo”.

Captura click_id opaco, timestamp, parámetros UTM y, cuando existan, gclid, gbraid, wbraid, fbclid y ttclid. Para Android genera correctamente el parámetro de Play Install Referrer. Sirve apple-app-site-association y assetlinks.json desde configuración versionada. Usa KV o caché para resolver enlaces y Queue para registrar clics de forma duradera; proporciona un adaptador local para pruebas.

La UI debe crear, editar, desactivar, copiar y probar enlaces, y mostrar clics por plataforma. Añade protección contra slugs reservados, bots básicos, duplicados y abuso. Prueba redirects iOS/Android/web, query strings, caracteres Unicode, enlaces desactivados, destinos ausentes y latencia. Documenta DNS y bindings Cloudflare con placeholders, nunca IDs reales.
~~~

---

## Prompt 5 — SDK público para React Native

~~~text
Implementa packages/react-native como el SDK abierto @attruvi/react-native. Prioriza la compatibilidad con las apps reales Tourixy, Solsuna y Rutimon. Localiza sus manifiestos y documenta una matriz de versiones antes de elegir APIs. Como mínimo prueba React Native 0.87 y New Architecture porque Tourixy usa esa base; documenta cualquier rango adicional realmente probado.

API pública mínima:

- Attruvi.initialize({ appKey, endpoint, environment, consent });
- Attruvi.track(name, properties, options);
- Attruvi.identify(userId, traits opcionales);
- Attruvi.resetIdentity();
- Attruvi.setConsent(state);
- Attruvi.getAttribution();
- Attruvi.flush();
- listener onAttributionChanged.

Implementa:

- generación y persistencia segura de installation_id y anonymous_id;
- captura de primera apertura, app_open y sesiones;
- cola offline persistente, envío por lotes, backoff con jitter y límite de tamaño;
- event_id estable para que un reintento no duplique;
- timestamps de dispositivo y recepción de servidor;
- recepción de Universal Links/App Links y parámetros Attruvi;
- Android Play Install Referrer;
- puente nativo mínimo en Kotlin y Swift cuando JavaScript no baste;
- respeto de consentimiento y ATT, sin recopilar IDFA/AAID sin autorización válida;
- redacción de PII y allowlist de propiedades;
- logs de depuración desactivados en release.

El SDK debe autovincularse en iOS y Android y tener podspec/Gradle/configuración compatible. Si Expo necesita development build, documéntalo; no prometas compatibilidad con Expo Go si requiere módulos nativos.

Crea una app de ejemplo aislada con botones para install simulation, sign_up, purchase y subscription. Añade pruebas unitarias de cola, sesiones, consentimiento, deep link e idempotencia; pruebas nativas donde sea viable; y un paquete generado que pueda instalarse en un proyecto React Native limpio.

Escribe una guía de instalación para humanos y otra sección “Pega esto en Codex/ChatGPT/Claude” con un prompt breve que instale el SDK sin exponer claves privadas.
~~~

---

## Prompt 6 — API de ingestión rápida, duradera e idempotente

~~~text
Implementa workers/ingest como la entrada pública del SDK y conecta de forma segura los eventos con Supabase.

Expón una API versionada:

- POST /v1/installations
- POST /v1/events/batch
- POST /v1/identify
- GET /v1/attribution
- GET /health

Valida las cargas con los esquemas de packages/core. La appKey identifica app y entorno, pero no es un secreto: valida estado, origen lógico, cuotas y límites; nunca le concedas acceso de lectura a datos. Diseña una capa opcional de App Attest/Play Integrity sin bloquear el MVP.

El Worker debe:

- asignar received_at y request_id;
- rechazar cuerpos grandes, formatos inválidos y lotes excesivos;
- aplicar rate limit por app, IP y patrón de abuso sin romper tráfico legítimo;
- colocar eventos válidos en Cloudflare Queue y responder rápido;
- consumir la cola en lotes, escribir en Supabase de forma idempotente y reintentar;
- enviar a dead-letter los fallos permanentes con motivo seguro;
- no registrar payloads completos que puedan contener PII;
- propagar trazas sin secretos.

Implementa un modo local reproducible con Miniflare o herramienta equivalente y un adaptador de cola en memoria solo para pruebas. Genera OpenAPI y ejemplos curl con datos ficticios.

Prueba: lotes repetidos, orden alterado, evento futuro, reloj atrasado, appKey revocada, payload malicioso, rate limit, caída temporal de Supabase, reintento de cola y dead-letter. Añade métricas básicas de accepted, rejected, queued, persisted y lag.

Realiza una prueba de carga razonable y documenta la capacidad medida, no estimada. El diseño debe poder escalar a un millón de instalaciones sin crear una fila o llamada externa innecesaria en el camino síncrono.
~~~

---

## Prompt 7 — motor de atribución y calidad de coincidencia

~~~text
Implementa el motor que relaciona clics con instalaciones y reactivaciones. Debe ser explicable, configurable, idempotente y respetuoso con la privacidad.

Orden de evidencia:

1. click_id recibido directamente por Universal Link/App Link;
2. Android Play Install Referrer con click_id o identificador de red;
3. identificadores oficiales de la red disponibles y consentidos;
4. coincidencia probabilística limitada, solo cuando sea legal y esté habilitada;
5. orgánico si no existe evidencia suficiente.

No presentes como determinista una instalación de iOS que no tenga una señal permitida. La coincidencia probabilística debe utilizar una ventana corta, datos minimizados y reglas documentadas; no debe crear fingerprinting persistente. Guarda match_type, confidence, evidence_summary, attribution_window, attributed_at y rule_version.

Implementa por defecto last non-organic click dentro de una ventana configurable, con organic fallback. Separa adquisición de re-engagement. Modela los niveles source → campaign → ad_group → ad y conserva tanto IDs externos como nombres históricos.

Cuando haya varios candidatos, puntúa y explica por qué ganó uno. Las reejecuciones con la misma versión deben producir el mismo resultado. Una nueva versión de reglas puede recalcular en modo dry-run y mostrar diferencias antes de aplicarse.

Expón servicios para:

- atribuir una nueva instalación;
- consultar la atribución del SDK;
- recalcular una instalación individual;
- corregir manualmente con auditoría;
- ver “por qué se atribuyó” en el dashboard.

Crea fixtures de Google, Meta, TikTok, afiliado, influencer y orgánico. Prueba clic directo, Android referrer, dos clics competidores, clic expirado, primer open duplicado, reinstalación, re-engagement, ausencia de consentimiento e iOS sin señal determinista.

Actualiza la documentación pública con una tabla honesta de exactitud por plataforma y método.
~~~

---

## Prompt 8 — recorrido del usuario, ingresos y suscripciones

~~~text
Completa el modelo de actividad posterior a la instalación y conviértelo en datos fiables.

Implementa el procesamiento de install, app_open, session_start, sign_up, purchase y eventos de suscripción. Define una sesión nueva tras 30 minutos de inactividad, configurable por app. Une anonymous_id con user_id después de identify sin perder historial y sin fusionar dos usuarios por error.

Para purchase exige transaction_id, value_minor y currency; admite products, quantity y order_id. Deduplica por app + transaction_id + tipo de evento. Para suscripciones modela inicio, renovación, cancelación, expiración, reembolso y estado actual. Mantén una interfaz para validación futura con App Store, Google Play o RevenueCat, pero diferencia claramente revenue_reported y revenue_verified.

Relaciona cada evento e ingreso con la atribución vigente según reglas versionadas. Conserva el origen original aunque cambie el nombre de la campaña. Implementa refunds negativos de manera contable y documentada.

Calcula por usuario/instalación:

- número de sesiones;
- primera y última actividad;
- registro y primera compra;
- revenue acumulado;
- días desde instalación;
- estado de pago;
- LTV observado.

Implementa detección de uninstall_inferred únicamente cuando exista una señal real, por ejemplo un token push invalidado de forma persistente. Guarda inferred_at, evidence y confidence. No llames “desinstalación confirmada” a una inferencia.

Añade una página de exploración de usuario anonimizado que muestre la línea temporal clic → instalación → sesiones → compra → postbacks, sin mostrar PII. Incluye filtros y paginación server-side.

Prueba identidad anónima que se registra, compra duplicada, reembolso, renovación, eventos fuera de orden, monedas diferentes, reinstalación y borrado de usuario.
~~~

---

## Prompt 9 — importación de gasto publicitario y costes manuales

~~~text
Implementa el subsistema de costes publicitarios con una arquitectura de conectores.

Define en packages/connectors una interfaz común para OAuth/configuración, prueba de conexión, descubrimiento de cuentas, sincronización incremental, normalización y estado. Implementa adaptadores para:

- Google Ads API: coste y jerarquía campaña/grupo/anuncio con los identificadores oficiales disponibles.
- Meta Marketing API: cuentas publicitarias e insights de gasto por campaña/ad set/ad.
- TikTok Business/Marketing API: advertiser y reporting por campaña/ad group/ad.
- Manual: entrada diaria, rango de fechas y carga CSV.

Consulta siempre la documentación oficial vigente durante la implementación y fija versiones de API explícitas. No adivines scopes ni nombres de campos. Guarda access/refresh tokens cifrados o en un almacén de secretos de servidor; jamás en tablas legibles por el navegador, logs o repositorio. La interfaz solo debe mostrar cuenta, estado, último sync y últimos cuatro caracteres de un identificador no sensible.

Crea jobs incrementales por día con cursor, solapamiento de seguridad para datos que cambian tarde, deduplicación y reintentos. Normaliza coste a unidades menores y conserva moneda original. No conviertas monedas sin una fuente y fecha de cambio registradas.

Relaciona el gasto con source/campaign/ad_group/ad mediante external_id. Los registros que no hagan match deben ir a una bandeja “Sin relacionar” para asignación manual, nunca desaparecer.

La UI debe guiar al usuario no técnico: “Conectar Google”, “Conectar Meta”, “Conectar TikTok” y “Añadir coste manual”. Si faltan credenciales de desarrollador, muestra los campos y pasos exactos pendientes, pero el resto del producto continúa funcionando.

Usa fixtures oficiales o sanitizados para pruebas contractuales. Prueba paginación, rate limit, token caducado, refresh, dato corregido posteriormente, moneda, campaña eliminada y CSV inválido.
~~~

---

## Prompt 10 — métricas, cohortes y agregados verificables

~~~text
Implementa el motor de métricas de Attruvi con fórmulas explícitas y agregados reproducibles.

Calcula por día y por niveles source, campaign, ad_group y ad:

- spend;
- clicks;
- installs;
- CPI = spend / installs;
- registered_users;
- buyers;
- CAC = spend / buyers;
- purchases;
- revenue;
- ROAS = revenue / spend;
- retention D1, D7 y D30;
- sessions por usuario;
- conversion rates;
- observed LTV por ventanas D7, D30, D90 y lifetime;
- uninstall_inferred rate, siempre etiquetado como inferido.

Define exactamente denominadores, zona horaria, cohortes de instalación, ventanas inclusivas y tratamiento de cero, refunds, usuarios anónimos y datos tardíos. No calcules promedios de ratios cuando corresponda dividir sumas.

Implementa rollups diarios incrementales que puedan recalcular un rango cuando llegue un evento o gasto atrasado. Conserva raw data y metric_version. Añade un reconciliador que compare rollup y cálculo desde raw para detectar desviaciones.

Expón consultas server-side con filtros por app, entorno, fechas, plataforma, fuente y nivel publicitario. Evita descargar millones de eventos al navegador. Añade caché invalidable donde mejore la lectura sin mostrar datos obsoletos después de un recálculo.

Crea un conjunto de prueba pequeño cuyas métricas puedan calcularse a mano y una prueba que compare cada resultado exacto, incluyendo división por cero y dinero. Añade benchmarks con un volumen sintético representativo.

Escribe docs/METRICS.md para personas no técnicas: nombre, significado, fórmula, ejemplo y posibles limitaciones.
~~~

---

## Prompt 11 — dashboard completo para comparar campañas y anuncios

~~~text
Construye el dashboard principal de Attruvi sobre los datos y consultas reales ya implementados. Mantén el estilo visual de la landing, pero prioriza legibilidad y decisiones rápidas.

Navegación:

- Resumen.
- Adquisición.
- Campañas.
- Usuarios.
- Enlaces.
- Eventos.
- Postbacks.
- Integraciones.
- Ajustes.

El resumen debe mostrar gasto, instalaciones, CPI, compradores, CAC, ingresos, ROAS, retención y LTV con comparación contra el periodo anterior. Añade un gráfico temporal y una tabla “Qué anuncios generan valor”.

Campañas debe permitir:

- filtrar por app, fechas, plataforma y fuente;
- cambiar jerarquía campaña → grupo → anuncio;
- ordenar cualquier métrica;
- comparar elementos seleccionados;
- abrir un detalle con gasto, instalaciones, compradores, ingresos, ROAS, retención y LTV;
- distinguir datos completos, parciales, en sincronización o sin costes.

Incluye estados reales de loading, vacío, error, permisos y credenciales pendientes. La demo puede usar los seeds, pero una cuenta real sin datos debe mostrar un onboarding útil, no métricas inventadas.

Haz el dashboard responsive y accesible. Usa tablas server-side con paginación; URLs compartibles para filtros no sensibles; formatos correctos de dinero, porcentajes y zona horaria. No expongas IDs internos innecesarios.

Añade un selector de app y entorno persistente. Un owner puede invitar miembros y asignar owner/admin/viewer; un viewer nunca cambia configuración.

Prueba navegación, filtros, fórmulas mostradas, RLS, estados vacíos, móvil y teclado. Verifica visualmente las páginas clave y corrige overflow, saltos y densidad.
~~~

---

## Prompt 12 — devolución de conversiones a Google, Meta y TikTok

~~~text
Implementa el pipeline de postbacks server-side para devolver conversiones y su valor a las plataformas.

Usa adapters versionados y documentación oficial vigente. Implementa, solo donde el proveedor lo permita:

- Google Ads: carga de conversiones usando los identificadores admitidos como gclid, gbraid o wbraid y campos de consentimiento requeridos.
- Meta: Conversions API/App Events según la configuración válida de la app, con event_id para deduplicar y parámetros permitidos.
- TikTok: Events API con click id/event id y campos admitidos.

No envíes PII sin base legal, consentimiento y normalización/hash exigidos por el proveedor. No inventes identificadores faltantes. Un evento no elegible debe quedar como skipped con motivo, no como success.

El usuario debe poder mapear eventos Attruvi a conversiones de cada red, elegir purchase value/currency, activar o pausar el destino y usar “Probar configuración” sin enviar una conversión real cuando el proveedor ofrezca test mode.

Implementa una cola outbox transaccional: pending → processing → succeeded, retryable_failed, permanently_failed o skipped. Incluye idempotency/deduplication, backoff, límites por proveedor, renovación de tokens, dead-letter y replay manual auditado. Nunca mantengas una transacción de base abierta durante una llamada externa.

En el dashboard muestra volumen, éxito, latencia, errores por código, último envío y detalle anonimizado. Redacta respuestas que contengan tokens.

Crea clientes falsos estrictos y fixtures contractuales para probar éxito, duplicado, rate limit, token caducado, campo rechazado, red caída, consentimiento ausente y replay. Si faltan credenciales, deja los tres conectores en “Pendiente de credenciales”, con todo el código y las pruebas terminados.
~~~

---

## Prompt 13 — instalación guiada para usuarios que programan con IA

~~~text
Diseña una experiencia de configuración que permita instalar Attruvi sin ser desarrollador profesional y usando Codex, ChatGPT o Claude.

Crea un asistente por app con pasos:

1. Datos de iOS y Android.
2. Crear clave pública del SDK, mostrándola una sola vez y permitiendo rotación.
3. Instalar @attruvi/react-native.
4. Configurar Universal Links/App Links.
5. Registrar eventos de registro, compra y suscripción.
6. Crear un enlace de prueba.
7. Ver el clic, la primera apertura y el evento en tiempo real.
8. Conectar redes publicitarias.

Cada paso debe tener explicación simple, estado automático y una sección “Hazlo con IA”. Genera un prompt específico para la app actual que el usuario pueda copiar en Codex/ChatGPT/Claude. El prompt debe incluir nombres de paquete y archivos esperados, pero nunca claves privadas. La appKey pública puede mostrarse con advertencia de su alcance.

Implementa un Debugger en vivo que reciba y muestre de forma anonimizada los eventos recientes del entorno development: validación, attribution result, cola y postbacks dry-run. Permite enviar un evento de prueba desde el dashboard sin contaminar producción.

Añade un diagnóstico automático que revise bundle/package IDs, dominios asociados, assetlinks/AASA, endpoint, versión del SDK y último evento. Devuelve acciones concretas en lenguaje normal.

Incluye snippets para React Native bare y, si se ha probado, Expo development build. Genera archivos ATTRUVI_SETUP.md descargables por app.

Prueba que una persona pueda completar el recorrido demo desde cero sin editar la base de datos ni usar una consola del proveedor, salvo para pegar credenciales cuando llegue a las integraciones.
~~~

---

## Prompt 14 — seguridad, privacidad y preparación de código abierto

~~~text
Realiza una fase específica de seguridad y privacidad antes de integrar Attruvi en apps reales.

Audita repositorio e historial reciente buscando secretos, dominios internos, IDs de cuentas, correos personales, tokens, service role keys, datos de usuarios y fixtures reales. No imprimas los valores encontrados: informa únicamente tipo, archivo y acción segura. Sustituye cualquier ejemplo por valores ficticios y rota fuera del código todo secreto comprometido.

Implementa:

- validación de entorno al arrancar;
- separación de claves públicas del SDK y secretos de servidor;
- cifrado de tokens OAuth;
- rotación y revocación;
- rate limits y protección contra replay;
- cabeceras web seguras y CSP compatible;
- auditoría de acciones administrativas;
- exportación y borrado de datos por usuario/app;
- política de retención configurable;
- consentimiento y flags de finalidad;
- borrado o anonimización en cascada;
- dependency audit y secret scanning en CI.

Revisa RLS tabla por tabla y crea pruebas negativas. Haz threat modeling de enlaces, ingestión, OAuth, postbacks y aislamiento multi-tenant. Clasifica riesgos y corrige los altos/críticos.

Prepara el repositorio público:

- LICENSE MIT;
- README con estado real del producto;
- CONTRIBUTING, SECURITY y CODE_OF_CONDUCT;
- arquitectura y guía de despliegue propio;
- .env.example completo sin valores;
- datos demo;
- política de divulgación responsable.

No publiques capturas con datos reales. No llames “anónimo” a un identificador persistente sin explicar su alcance. Añade páginas legales iniciales coherentes con los datos realmente recogidos, marcando que requieren revisión jurídica antes de uso comercial.
~~~

---

## Prompt 15 — compatibilidad con Tourixy, Solsuna y Rutimon y prueba integral

~~~text
Valida Attruvi contra las aplicaciones reales objetivo sin poner en riesgo sus versiones de producción.

Localiza los repositorios más recientes de Tourixy, Solsuna y Rutimon. Lee sus AGENTS.md y manifiestos. Crea docs/APP_COMPATIBILITY.md con React Native, arquitectura, iOS target, Android SDK, sistema de navegación, módulos nativos y build system. No afirmes compatibilidad si no has construido o probado un fixture equivalente.

Primero integra el paquete local/tarball de @attruvi/react-native en un fixture que reproduzca cada combinación encontrada. Compila Android y ejecuta typecheck/tests; compila iOS cuando el entorno lo permita. Corrige el SDK, no las apps, si el problema es general.

Después crea una integración piloto de Tourixy en una rama o worktree aislado:

- initialize en el punto correcto del arranque;
- app_open y sesiones automáticas;
- identify después del login;
- sign_up;
- purchase/subscription solo en el punto real de confirmación;
- deep links;
- consentimiento;
- entorno development con una clave pública de prueba.

No mezcles secretos ni despliegues la app a tiendas. No modifiques Solsuna o Rutimon en producción: prepara parches o guías verificadas después de la prueba de Tourixy.

Construye un E2E sintético:

crear enlace TikTok ficticio → click Worker → redirect → install/referrer simulado → primera apertura SDK → atribución → sign_up → purchase de 49,90 EUR → coste de campaña → métricas → postbacks en dry-run.

La prueba debe afirmar resultados exactos: 1 install, 1 buyer, revenue 49,90 €, source/campaign/ad correctos, CPI/CAC/ROAS esperados y tres postbacks elegibles o skipped con razón.

Añade regresiones para offline/reintento, duplicados, dos organizaciones, usuario sin consentimiento y caída temporal de cada servicio.
~~~

---

## Prompt 16 — despliegue completo, observabilidad y aceptación final

~~~text
Lleva Attruvi a un estado de producción verificable usando los proyectos existentes de Vercel, Supabase y Cloudflare. No crees recursos duplicados si ya existen y no cambies DNS ajeno a Attruvi.

Antes de tocar producción:

1. comprueba git limpio y rama correcta;
2. ejecuta test, typecheck, lint y build;
3. aplica migraciones en staging y ejecuta smoke tests;
4. despliega links Worker e ingest Worker en staging;
5. verifica el E2E sintético completo;
6. documenta rollback.

Después despliega:

- web/dashboard en Vercel y dominio attruvi.com;
- rutas y dominios de enlaces en Cloudflare;
- Worker de ingestión y Queue/dead-letter;
- migraciones, cron/jobs y configuración de Supabase;
- redirect URLs de autenticación;
- variables de entorno desde almacenes de secretos, nunca desde commits o mensajes.

Si faltan credenciales de Google Ads, Meta o TikTok, no bloquees el despliegue: deja los conectores desactivados y muestra en Integraciones la lista exacta de valores que el propietario debe añadir. Todo lo demás debe funcionar con enlaces, SDK, costes manuales, eventos, métricas y postbacks dry-run.

Configura observabilidad sin payloads sensibles: logs estructurados, request/trace IDs, métricas de cola, errores, latencia, sync freshness, postback success y alertas. Crea runbooks para cola atrasada, proveedor caído, token caducado y migración fallida.

Ejecuta aceptación en escritorio y móvil:

- alta por Google;
- alta manual, verificación, login y contraseña olvidada;
- onboarding;
- crear/clicar enlace sin pantalla intermedia;
- recibir instalación y compra;
- ver campaña/anuncio, ingreso y métricas;
- introducir coste manual;
- ejecutar postback dry-run;
- aislamiento entre organizaciones;
- accesibilidad y errores de consola.

Haz una revisión final del repositorio público para confirmar que no hay secretos. Actualiza README, BUILD_STATUS, CHANGELOG y una guía “Empieza aquí”. Solo marca el producto como listo cuando todas las pruebas que no dependan de credenciales externas pasen. Entrega URLs, versiones, commits, pruebas, costes aproximados de infraestructura, límites conocidos y la lista mínima de credenciales que queda por introducir.
~~~

---

## Lista final de credenciales externas que probablemente habrá que añadir

Codex debe confirmar los nombres exactos según la implementación y nunca escribir valores reales en este documento:

- Supabase URL, anon/publishable key y claves de servidor solo en entornos backend.
- Google OAuth Client ID/secret para acceso a Attruvi.
- Google Ads developer token, OAuth y customer/manager IDs.
- Meta App ID/secret y acceso a Marketing API/Conversions API.
- TikTok App ID/secret y acceso a Business/Events API.
- Cloudflare account/zone IDs y bindings de Worker/KV/Queue gestionados como secretos o configuración.
- Claves de firma/cifrado internas generadas por entorno.
- Datos de Apple Universal Links y Android App Links de cada aplicación.

El sistema debe arrancar y mostrar claramente qué integración está desactivada si alguna credencial no está presente.
