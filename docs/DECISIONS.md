# Decisiones de arquitectura

## ADR-001 — Mantener Next.js en la raíz

Estado: aceptada. La integración de Vercel y el dominio existentes dependen de la raíz actual. Los nuevos componentes se añaden como workspaces sin mover la landing.

## ADR-002 — Contratos compartidos con Zod y IDs opacos

Estado: aceptada. Los límites HTTP validan datos en ejecución y TypeScript evita mezclar IDs que son UUID en todos los casos. Las fechas se normalizan a UTC y los importes terminan como `bigint`.

## ADR-003 — Postgres como límite de aislamiento e idempotencia

Estado: aceptada. La aplicación no es la única defensa: RLS, FKs compuestas, checks e índices únicos protegen tenants y reintentos.

## ADR-004 — Dos helpers RLS con privilegios mínimos

Estado: aceptada. Consultar `organization_members` desde su propia policy sería recursivo. Los helpers `SECURITY DEFINER` quedan en un esquema no expuesto, validan `auth.uid()`, fijan un search path vacío y solo devuelven booleanos.

## ADR-005 — Escritura operativa solo con identidad de servicio

Estado: aceptada. El SDK no puede insertar directamente clics, eventos, costes, métricas ni jobs. Los clientes autenticados solo leen; Workers y procesos internos usan una clave de servidor que jamás llega al navegador.

## ADR-006 — Particionado diferido con umbral explícito

Estado: aceptada. Particionar hoy complicaría la unicidad global necesaria para deduplicar. Se mantiene un diseño indexado y una migración concreta al superar 100 millones de filas, con retención por particiones.

## ADR-007 — Fecha de compatibilidad Cloudflare

Estado: aceptada. Cada Worker fija una fecha soportada por el runtime instalado; ingestión usa `2026-09-17`. Se actualizará junto con Wrangler, los tipos generados y sus pruebas, nunca de forma implícita.

## ADR-008 — Sesiones Supabase SSR verificadas

Estado: aceptada. El navegador inicia OAuth con PKCE y los Route Handlers intercambian el código por cookies. `proxy.ts` refresca tokens en rutas privadas, pero la autorización real vuelve a comprobar `getClaims()` en la capa de acceso a datos, Server Actions y APIs. `getSession()` no se usa como prueba de identidad.

## ADR-009 — Espacio personal mediante RPC atómica

Estado: aceptada. El primer acceso necesita crear tres filas dependientes sin estados parciales. `ensure_personal_workspace`, `save_personal_onboarding_draft` y `complete_personal_onboarding` son `SECURITY DEFINER` porque deben atravesar RLS de forma transaccional. Están limitadas a `authenticated`, fijan `search_path = ''`, validan `auth.uid()`, no aceptan identificadores de tenant y aplican un bloqueo transaccional por usuario.

## ADR-010 — Respuestas de autenticación no enumerables

Estado: aceptada. El acceso incorrecto, la recuperación y el reenvío no exponen mensajes internos del proveedor ni confirman si una cuenta existe. La interfaz añade bloqueo mientras una petición está activa y 60 segundos entre reenvíos; Supabase mantiene el límite definitivo del servidor.

## ADR-011 — Implementación independiente de Link My App

Estado: aceptada. Link My App tiene licencia Apache-2.0, pero su Worker muestra un interstitial y está acoplado a Firebase/D1 y a configuración del despliegue original. Attruvi conserva solo patrones arquitectónicos generales y usa contratos nuevos; no se copia código ni información del propietario.

## ADR-012 — KV para lectura, Queue para durabilidad y Supabase como verdad

Estado: aceptada. KV reduce latencia y puede ser eventualmente consistente, por lo que no es el registro analítico. Cada clic se acepta en Queue y el consumidor lo inserta por lotes en Postgres. Un índice único absorbe reintentos. Las ediciones purgan la caché, pero una entrada antigua no puede ampliar privilegios porque solo contiene el contrato público de un enlace.

## ADR-013 — Redirect directo y parámetros de instalación

Estado: aceptada. El Worker nunca sirve una pantalla intermedia. Universal Links/App Links pueden abrir la app; el fallback responde `302`. Android recibe `attruvi_click_id`, UTMs e IDs disponibles dentro de Play Install Referrer. En iOS la atribución posterior dependerá de las señales permitidas por Apple y las redes; no se promete determinismo ni se usa fingerprinting oculto.

## ADR-014 — Hashes minimizados para control de abuso

Estado: aceptada. La deduplicación temporal necesita una señal estable, pero no justifica persistir IP o `User-Agent`. El Worker reduce la IP a prefijo, aplica un salt secreto y SHA-256 a prefijo y agente, limita la ventana a 20 segundos y marca bots/pruebas sin incluirlos en los contadores principales.

## ADR-015 — Compatibilidad SDK guiada por las apps reales

Estado: aceptada. El rango inicial es React Native `>=0.86.3 <0.88`: Tourixy usa 0.87.0 y Solsuna/Rutimon usan 0.86.3 sobre Expo 57. No se afirma compatibilidad fuera del rango probado. El paquete hereda versiones nativas del host y mantiene Android 24/iOS 15.1 como mínimos de fallback.

## ADR-016 — Identidad segura y analítica bajo consentimiento

Estado: aceptada. `installation_id`, `anonymous_id` e identidad viven en Keychain o EncryptedSharedPreferences. La cola solo empieza con consentimiento `granted`; denegarlo elimina cola, identidad y atribución. El SDK no lee IDFA/AAID, rechaza correo/teléfono como `userId` y aplica allowlist más redacción de PII a propiedades.

## ADR-017 — Interoperabilidad New Architecture sin acoplar las apps

Estado: aceptada. El módulo Kotlin/Swift se autovincula y se resuelve con `TurboModuleRegistry`; React Native lo adapta mediante su capa oficial de interoperabilidad. Así no se modifican `MainApplication` ni `AppDelegate` y se mantiene Swift como implementación iOS. Se migrará a un TurboModule Codegen directo cuando Swift pueda consumir la interfaz generada sin un adaptador Objective-C++ adicional.

## ADR-018 — AppKey pública con prueba de lectura separada

Estado: aceptada. La appKey identifica una app y un entorno, limita cuotas y puede revocarse, pero vive dentro de una aplicación distribuida y por tanto no se considera secreta. Nunca autoriza consultas analíticas. La única lectura pública, la atribución de una instalación, exige un token opaco de 256 bits emitido al registrar esa instalación; solo su SHA-256 llega a Postgres.

## ADR-019 — Queue antes de Postgres y RPC por lote

Estado: aceptada. El camino HTTP valida y publica un mensaje duradero antes de responder `202`; no crea una llamada o fila externa por evento. El consumidor entrega hasta 50 mensajes a una RPC transaccional que vuelve a comprobar el ámbito de la clave y usa restricciones idempotentes. Fallos temporales reintentan con backoff; la DLQ explícita solo conserva IDs operativos y un motivo seguro, nunca el payload.

## ADR-020 — Integridad móvil opcional pero no simulada

Estado: aceptada. Los contratos reservan `App Attest`/`Play Integrity` y guardan el resultado `absent`, `unverified` o `verified`. En modo opcional el MVP sigue funcionando sin estos proveedores; en modo obligatorio falla de forma cerrada si el verificador no está configurado. Un token recibido no se marca como verificado sin una comprobación oficial.

## ADR-021 — Atribución versionada, explicable y separada por objetivo

Estado: aceptada. La adquisición pertenece a la instalación y la reactivación a una sesión. Un
evaluador puro ordena evidencia directa, Install Referrer, señales oficiales consentidas,
coincidencia limitada y fallback orgánico; los empates usan fecha del clic y clave estable. Cada regla
tiene versión y permite `dry-run`. Se conservan candidatos, explicación y snapshots históricos antes
de marcar una decisión actual, por lo que una reejecución idempotente no borra la trazabilidad.

## ADR-022 — Probabilística cerrada por defecto

Estado: aceptada. No se usa fingerprinting persistente. La opción probabilística exige consentimiento
completo, base legal explícita, dos hashes salados y una ventana corta. Los Workers comparten el salt
sin guardarlo en Git; la base solo recibe hashes y una explicación minimizada. El resultado siempre se
etiqueta `probabilistic` y nunca determinista. iOS sin señal permitida cae en evidencia insuficiente.

## ADR-023 — Log inmutable y proyecciones reconstruibles

Estado: aceptada. `events` conserva el transporte idempotente. La agrupación de 30 minutos se calcula en `activity_sessions` ordenando por tiempo del dispositivo y desempate estable. Cuando llega un evento atrasado, solo se reconstruye su instalación. Esto evita confiar en un `sessionId` arbitrario o en el orden de Queue.

## ADR-024 — Identidad explícita sin fusión probabilística

Estado: aceptada. Una instalación comienza con un perfil seudónimo persistente y limitado a esa app; no es anonimato irreversible. `identify` puede asignar el primer hash conocido o unir una reinstalación al mismo hash; si el perfil ya tiene otro hash, falla. No se fusionan perfiles por IP, dispositivo, similitud o atribución. El borrado elimina identificadores y conserva únicamente el historial ya desvinculado necesario para métricas y contabilidad.

## ADR-025 — Libro mayor en lugar de saldos mutables

Estado: aceptada. Compras, renovaciones y reembolsos son apuntes independientes con unicidad por app, transacción y tipo. Los reembolsos siempre son negativos. Las proyecciones se recalculan desde el libro mayor y conservan monedas por separado. Revenue declarado y verificado son campos y estados distintos.

## ADR-026 — Desinstalación siempre inferida

Estado: aceptada. El SDK no puede declarar una desinstalación. Solo una invalidación persistente de token push, repetida y separada al menos 24 horas, crea una inferencia con evidencia y confianza. La interfaz usa siempre “inferida” y permite retractarla; no existe el estado “confirmada”.

## ADR-027 — Versiones publicitarias fijadas

Estado: aceptada. Google Ads usa `v25`, Meta Marketing API `v26.0` y TikTok Marketing API `v1.3`. Los endpoints, scopes, campos y paginación proceden de documentación oficial consultada durante la implementación. Una actualización requiere cambiar código, fixtures contractuales y documentación de forma explícita; nunca se adivinan campos ni se sigue una versión implícita.

## ADR-028 — Tokens cifrados fuera del esquema expuesto

Estado: aceptada. Los tokens OAuth se cifran en servidor mediante AES-256-GCM con una clave base64 de 32 bytes y el ID de cuenta como datos autenticados adicionales. El llavero versionado definido en ADR-043 reemplaza la variable única inicial; esta solo se admite durante la transición. Postgres guarda ciphertext e IV en `private.connector_secrets`; las tablas públicas solo conservan referencia, caducidad y últimos cuatro caracteres de un identificador no sensible. Las RPC de secretos son exclusivas de `service_role` y ningún payload o token se registra.

## ADR-029 — Gasto diario corregible y sin FX implícito

Estado: aceptada. Cada fila usa unidades menores enteras, moneda original y una clave externa estable. La sincronización relee tres días por defecto; una corrección reemplaza la misma fila con versión creciente. Las monedas permanecen separadas hasta disponer de una fuente de cambio y fecha registradas. Una jerarquía desconocida entra en **Sin relacionar** y requiere match futuro o asignación manual auditada.

## ADR-030 — RPC administrativas de costes con validación interna

Estado: aceptada. `enqueue_connector_sync`, `upsert_manual_ad_costs` y `assign_ad_cost_campaign` son `SECURITY DEFINER` porque realizan operaciones atómicas a través de tablas operativas cerradas por RLS. Es deliberado que `authenticated` pueda invocarlas: fijan `search_path`, comprueban `auth.uid()` y rol owner/admin contra la organización derivada de la cuenta/app, revocan `public` y `anon`, y no confían en un `organization_id` del cliente. El asesor de Supabase las señala como advertencia genérica; las funciones de secretos, persistencia y scheduling siguen limitadas a `service_role`.

## ADR-031 — Cohortes de instalación y ratios desde sumas

Estado: aceptada. `metric_date` es el día local de primera apertura en la zona horaria de la app. Retención y LTV usan cohortes maduras y ventanas naturales inclusivas; los ratios no se persisten ni se promedian entre días. La consulta suma numeradores y denominadores y divide al final con `numeric`; un denominador cero devuelve `NULL`.

## ADR-032 — Rollups versionados, raw inmutable y reconciliación

Estado: aceptada. `daily_metrics` es una proyección reconstruible, no la fuente de verdad. Los triggers solo marcan días afectados; un job de servicio agrupa rangos, recalcula bajo `metric_version`, conserva versiones anteriores y compara hashes contra raw. La caché por app expira en el mismo proceso que completa el recálculo.

## ADR-033 — Moneda y plataforma sin asignaciones inventadas

Estado: aceptada. Cada moneda mantiene su cubo y nunca se agrega con otra sin una tasa fechada. Al filtrar por plataforma se excluye gasto sin plataforma conocida; no se reparte proporcionalmente. Sin filtro, el servidor combina correctamente gasto no asignado y resultados iOS/Android.

## ADR-034 — Contexto del dashboard por slugs y autorización por UUID

Estado: aceptada. Las URLs compartibles solo incluyen slug de organización, slug de app, entorno y filtros no sensibles. El servidor resuelve esos valores dentro de las membresías visibles por RLS y solo entonces usa los UUID internos. Las consultas de métricas verifican acceso con el cliente autenticado antes de entrar en la caché de servicio; si esa identidad técnica no está configurada, ejecutan la misma RPC con la sesión y RLS en lugar de fallar. El navegador nunca recibe eventos crudos ni identificadores internos innecesarios.

## ADR-035 — Invitaciones con token efímero y escritura auditada

Estado: aceptada. El owner crea un token aleatorio de 256 bits y Postgres solo conserva su SHA-256. Aceptarlo exige sesión verificada, correo coincidente, estado pendiente y vigencia. Crear invitaciones, aceptar y cambiar roles son RPC `SECURITY DEFINER` con `search_path` vacío, grants mínimos y validaciones internas; leer el equipo también valida membresía antes de consultar `auth.users`. Las escrituras directas de `organization_members` quedan revocadas para `authenticated`, de modo que nadie puede eludir la auditoría ni degradar al último owner.

## ADR-036 — Estado de calidad separado de las métricas

Estado: aceptada. Una cifra no se interpreta igual si el gasto está pendiente o un conector sigue sincronizando. El dashboard deriva un estado explícito —completo, parcial, sincronizando o sin costes— desde cuentas, jobs y filas sin relacionar. Una cuenta sin hechos muestra pasos de onboarding y nunca rellena tarjetas con números de demo.

## ADR-037 — Errores públicos seguros y SVG hidratable

Estado: aceptada. La frontera de error del dashboard muestra una explicación recuperable y una referencia técnica, pero no expone mensajes internos del servidor. Los títulos accesibles del gráfico SVG se construyen como una única cadena: el DOM que interpreta el navegador coincide así con el HTML del servidor y la hidratación de React permanece estable en producción.

## ADR-038 — Outbox transaccional y payload efímero

Estado: aceptada. Insertar un evento y su trabajo de postback ocurre en la misma transacción. El worker reclama y confirma el lease antes de hacer red; ninguna transacción de base permanece abierta durante una llamada externa. El outbox solo guarda IDs y metadatos operativos. Consentimiento, clic y valor se leen de filas autoritativas y el payload se construye en memoria justo antes del envío, por lo que tokens, click IDs y PII no terminan en jobs, intentos o logs.

## ADR-039 — Elegibilidad cerrada y deduplicación del proveedor

Estado: aceptada. Sin consentimiento `granted` o sin `gclid`/`gbraid`/`wbraid`, `fbclid` o `ttclid` obtenido del clic atribuido, el trabajo es `skipped`. Nunca se inventa una señal ni se llama éxito a una omisión. Reintentos y replay conservan el `event_id`; Google usa `order_id` cuando existe y Meta/TikTok reciben `event_id`, de modo que el proveedor puede deduplicar una entrega incierta.

## ADR-040 — Pruebas de proveedor que no contaminan campañas

Estado: aceptada. Google se prueba con `validate_only` y Meta con `test_event_code`. La versión fijada de TikTok Events API 2.0 no ofrece un modo universal que garantice no entregar, por lo que Attruvi limita “Probar” a una lectura de cuenta y validación local del payload. La interfaz explica la diferencia y nunca envía una conversión falsa para simular éxito.

## ADR-041 — Setup real en development y claves de una sola visualización

Estado: aceptada. El asistente deriva el progreso de filas autoritativas y no de casillas manuales. La appKey es pública, pero solo se devuelve completa al crearla; el servidor envía a la RPC su SHA-256 y Postgres conserva hash, prefijo, ámbito y revocación. La rotación es transaccional y auditada. Las dos RPC nuevas usan `SECURITY DEFINER` para efectuar operaciones atómicas que las policies normales no pueden expresar, fijan `search_path`, exigen `auth.uid()`, verifican membresía owner/admin y limitan su `EXECUTE` a `authenticated`/`service_role`. Las pruebas atraviesan ingestión y actividad reales bajo `development`; cualquier outbox resultante nace `skipped` con `development_dry_run`, por lo que nunca puede salir hacia una red. Las trazas del Debugger son temporales, anonimizadas y aisladas por RLS.

## ADR-042 — Consentimiento por finalidad y seudónimos explícitos

Estado: aceptada. `granted` no implica por sí solo publicidad. El SDK transmite flags separados para analítica, atribución, publicidad y personalización; publicidad requiere atribución. Un postback solo es elegible cuando `advertising=true`. Los UUID persistentes se describen como seudónimos limitados a una app, nunca como anonimato irreversible.

## ADR-043 — Llavero versionado para tokens OAuth

Estado: aceptada. AES-256-GCM mantiene el ID de cuenta como AAD y selecciona la clave por `key_version`. `CONNECTOR_ENCRYPTION_KEYS` conserva versiones anteriores durante la rotación y `CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION` cifra escrituras nuevas. Revocar elimina el ciphertext y desactiva la cuenta; el valor nunca entra en logs o tablas expuestas.

## ADR-044 — Retención minimizada, no destrucción de métricas

Estado: aceptada. Los plazos por app borran detalles del debugger y seudonimizan identificadores de clic, propiedades de evento y respuestas de postback. Importes y contadores necesarios para contabilidad/agregados se conservan sin sus identificadores de negocio. El borrado de un perfil invalida tokens, hashes e IDs externos y deja una auditoría sin guardar el valor eliminado.

## ADR-045 — Operaciones administrativas resistentes a replay

Estado: aceptada. OAuth usa un estado aleatorio cuyo SHA-256 se registra con usuario/app/proveedor y se consume una sola vez. La purga KV exige bearer, HMAC del cuerpo, timestamp de cinco minutos y nonce almacenado diez minutos. Los eventos del SDK mantienen replay idempotente por `event_id`, idempotency key y transacción/compra.

## ADR-046 — Compatibilidad solo después de construir la combinación real

Estado: aceptada. El rango React Native 0.86.3–0.87.x se conserva porque el mismo tarball se compiló en RN 0.87 bare/New Architecture y en dos proyectos Expo 57/RN 0.86.3 generados por CNG. Android queda validado por builds arm64 dentro de Tourixy, Solsuna y Rutimon aislados. La revisión de Podspec, targets y entitlements no se presenta como build iOS: esa plataforma sigue pendiente de macOS/Xcode y dispositivo físico.

## ADR-047 — El claim de clic se libera si Queue no acepta el mensaje

Estado: aceptada. El Worker reclama una clave de deduplicación antes de enviar a Queue para limitar clics repetidos. Si Queue falla, elimina ese claim antes de propagar el error; de otro modo un reintento válido parecería duplicado y perdería el único clic. La persistencia final conserva su unicidad en Postgres, de modo que liberar tras un fallo no debilita la idempotencia durable.

## ADR-048 — Apps de validación aisladas e ingresos dirigidos por eventos

Estado: aceptada. Tourixy, Solsuna, Rutimon y cualquier otro repositorio inspeccionado se usan exclusivamente como fixtures de compatibilidad del SDK y nunca como datos o proyectos incluidos en Attruvi. Cada organización registra sus propias apps. El camino principal de ingresos es `app cliente → SDK → evento purchase/suscripción/reembolso → atribución → métricas/postback`; App Store, Google Play o RevenueCat son verificadores opcionales y no requisitos para atribuir el importe reportado.
