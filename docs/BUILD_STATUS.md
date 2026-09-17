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
- Persistencia Supabase idempotente de instalaciones, identidades hasheadas, sesiones, eventos, compras, suscripciones y atribución directa; prueba de instalación separada para la única lectura pública.
- OpenAPI, ejemplos ficticios, entorno local con Miniflare, adaptador en memoria exclusivo de pruebas y prueba de carga medida.
- Todas las migraciones aplicadas al proyecto Supabase Attruvi. Las 52 claves externas cuentan con índice de cobertura y la función técnica de auto-RLS no es ejecutable por `anon` ni `authenticated`.

## Verificación disponible

- `npm run verify`: lint, typecheck, pruebas, landing y builds de workspaces.
- `npm run test:schema`: contrato estructural de migración/seeds sin necesitar Docker.
- `npm run test:web`: registro, verificación, contraseña incorrecta, recuperación, Google OAuth simulado, callback seguro y clasificación de rutas privadas.
- `npm run test:db`: aislamiento RLS e invariantes en Postgres local; necesita `supabase start` y Docker.

En esta ejecución pasó `npm run verify`: lint, typecheck de raíz y cinco workspaces, 14 pruebas web, 35 pruebas de workspaces, contrato estructural SQL y builds de producción de Next.js, los paquetes y ambos Workers. El Worker de ingestión aporta 9 pruebas sobre idempotencia/reordenación, relojes, claves revocadas, origen lógico, PII/payload malicioso, límites, identidad, prueba de atribución, caída temporal, reintentos y DLQ. El build incluye `/dashboard/apps` y `/dashboard/links`; el Worker de enlaces mantiene sus 13 pruebas de redirects, Unicode, Install Referrer, destinos, bots, deduplicación, abuso y asociaciones nativas.

La suite pgTAP tiene 24 assertions. Aunque `npm run test:db` local no pudo conectarse porque este equipo no tiene Docker/Podman activo, se aplicó el historial completo al proyecto Supabase Attruvi y las 24 assertions pasaron dentro de una transacción revertida. Una prueba SQL adicional confirmó que repetir el mismo lote deja exactamente un evento y que la lectura de atribución exige el token correcto; todos sus datos se revirtieron.

La prueba de carga local más reciente aceptó 5.000/5.000 solicitudes con concurrencia 100 en 1.025 ms: 4.878,05 solicitudes/s, p50 13 ms y p95 27 ms. Mide validación, controles y cola en memoria; no se presenta como rendimiento de red de Cloudflare o Supabase.

Los asesores remotos de Supabase ya no reportan funciones técnicas públicas ni claves externas sin índice. Permanecen seis advertencias esperadas por RPC autenticadas `SECURITY DEFINER`, justificadas en `DECISIONS.md`, 84 índices aún “sin uso” porque la base está recién creada y el ajuste externo del pool de Auth.

La fase del SDK superó TypeScript estricto con los tipos de React Native 0.87, 9 pruebas unitarias y `npm pack`. El tarball generado se instaló en una app limpia RN 0.87 con `newArchEnabled=true`; el autolinking detectó Android e iOS. La compilación Android no pudo ejecutarse porque este equipo no tiene JDK ni Android SDK, y la compilación iOS requiere macOS/Xcode.

## Pendiente de fases posteriores

- Credenciales y APIs de Google Ads, Meta Ads y TikTok Ads.
- Agregación de métricas y conectores/postbacks de las redes en producción.
- Verificadores oficiales de App Attest y Play Integrity; el contrato está preparado pero no se marca ningún token como verificado todavía.

Nada de lo anterior se presenta como funcional hasta que se implemente y verifique en su fase correspondiente.

## Configuración externa pendiente

- Añadir en Supabase las URLs de `docs/AUTH_SETUP.md`, activar Google con su Client ID/Secret y configurar un SMTP de producción.
- Añadir las variables públicas de Supabase a los entornos de Vercel. No se requieren secretos de Google en el navegador.
- Crear KV/Queues, configurar los tres secretos del Worker y asociar el dominio de enlaces siguiendo `docs/SMART_LINKS_CLOUDFLARE.md`.
- Para publicar ingestión en Cloudflare: elegir la cuenta destino, crear su KV y sus dos Queues, y cargar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` como secretos. La clave de servicio no está disponible en el repositorio y correctamente no se ha inventado ni expuesto.
- Añadir las asociaciones reales de cada app a `association-config.ts` y comprobar Universal Links/App Links en dispositivos.
- Compilar la app de ejemplo en Android y iOS en un host con JDK/Android SDK y Xcode, respectivamente.
