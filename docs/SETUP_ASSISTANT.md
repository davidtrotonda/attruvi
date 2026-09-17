# Asistente de instalación por app

La ruta protegida `/dashboard/setup` guía a una persona no técnica por ocho pasos y calcula el estado desde datos reales. El asistente siempre usa `development` para probar; cambiar el selector global a producción no convierte una simulación en una señal productiva.

## Qué comprueba

1. Bundle ID y package name guardados en `app_platforms`.
2. appKey pública activa de development. El navegador recibe el valor completo únicamente en la respuesta que la crea; Postgres guarda SHA-256, prefijo, ámbito, estado y auditoría.
3. Una primera apertura real del SDK y su versión. Las simulaciones `dashboard-test` se muestran, pero no cuentan como instalación real.
4. Respuesta y contenido de AASA/assetlinks en el dominio configurado.
5. Recepción de `sign_up`, `purchase` y `subscription_started` en development.
6. Existencia de un enlace inteligente activo.
7. Presencia de clic de prueba, primera apertura y evento en el Debugger.
8. Al menos una cuenta publicitaria en estado `ready`.

Cada paso incluye lenguaje simple y “Hazlo con IA”. El prompt se construye en servidor con el nombre de app, bundle/package, endpoint, dominio y archivos esperados. Una clave recién creada puede añadirse manualmente al prompt; nunca se insertan secretos de Supabase, Cloudflare o redes publicitarias.

## Debugger

`development_debug_events` conserva solo estado operacional sanitizado: etapa, resultado, versión del SDK, plataforma, regla y referencias opacas. No guarda propiedades de evento, IP, agente, correo, teléfono, tokens ni credenciales. RLS permite leer únicamente a miembros de la organización; las escrituras proceden de los Workers/triggers o de la RPC owner/admin de prueba.

La UI refresca cada 3,5 segundos y muestra validación, paso por Queue, persistencia, primera apertura, atribución, evento y postback. La retención prevista es siete días.

## Prueba segura

`create_development_test_event` construye una instalación anónima y un evento válido, y los pasa por `ingest_sdk_messages_v3`. Está limitada a owner/admin y diez trazas recientes por minuto. Las conversiones de development crean una fila outbox `skipped` con motivo `development_dry_run`; el Worker no puede reclamarlas ni contactar a Google, Meta o TikTok.

## Archivo descargable

`GET /api/private/apps/setup-file?workspace=<slug>&app=<slug>` exige sesión y membresía, responde `ATTRUVI_SETUP.md` con `Cache-Control: private, no-store` e incluye snippets para React Native bare y Expo development build. Expo Go se declara incompatible porque el SDK usa módulos nativos.
