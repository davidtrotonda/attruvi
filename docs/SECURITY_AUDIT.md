# Auditoría de seguridad y privacidad

Fecha: 2026-09-17. Alcance: archivos seguidos por Git, historial completo disponible, dependencias npm, RLS, Workers, OAuth, postbacks y APIs privadas.

El escaneo es redactado por diseño: solo muestra tipo, archivo y acción; nunca el valor coincidente. Se ejecuta con `npm run security:secrets` y CI lo repite sobre el historial.

## Resultado del escaneo

No se detectaron claves privadas, tokens, JWT, secret keys de Supabase ni secretos OAuth de severidad alta o crítica.

| Tipo | Archivo/ámbito | Acción segura |
|---|---|---|
| Hash generado, no secreto | `workers/*/worker-configuration.d.ts` | Excluido del detector de IDs de cuenta; es la huella reproducible de Wrangler. |
| Identificador de binding histórico, no secreto | historial de `workers/links/wrangler.jsonc` | Ya no está en el archivo actual; mantener bindings/IDs reales fuera de ejemplos y recrear el recurso si su exposición se considera sensible. |
| Correo de fixture o configuración comentada | `supabase/seed.sql`, `supabase/config.toml`, `supabase/tests/*` | Se mantienen únicamente dominios reservados o locales; nunca copiar datos reales a fixtures. |
| Metadato de tercero | `examples/attruvi-react-native/package-lock.json` | Excluido como metadato firmado del paquete; no pertenece a un usuario de Attruvi. |
| Contacto de proyecto | `packages/react-native/AttruviReactNative.podspec` | Solo se permite una dirección funcional del proyecto, no un correo personal. |
| Ejemplos de entorno | `.env.example`, `workers/*/.dev.vars.example` | `.env.example` no contiene valores; los Workers usan placeholders reconocibles y deben recibir secretos con Wrangler. |

No hay un secreto confirmado que rotar como consecuencia de esta auditoría. Si el escáner detecta uno en el futuro, la respuesta obligatoria es revocarlo en el proveedor, reemplazarlo en los gestores de secretos, invalidar sesiones derivadas y limpiar el historial coordinadamente; borrar solo la línea actual no basta.

## Dependencias

`npm audit --json` informó 0 vulnerabilidades conocidas (0 críticas, altas, moderadas o bajas) en 764 dependencias contabilizadas durante esta revisión. Este resultado es puntual y CI vuelve a ejecutar `npm audit --audit-level=high`.

## Controles aplicados

- validación de entorno al arrancar, modo landing explícito y rechazo de secretos `NEXT_PUBLIC_*`;
- llavero AES-256-GCM versionado, AAD por cuenta, rotación sin indisponibilidad y revocación;
- estados OAuth de un solo uso almacenados como SHA-256, expiración y vinculación usuario/app/proveedor;
- firma HMAC, timestamp y nonce para purgas de caché administrativas;
- propósito publicitario explícito antes de un postback;
- CSP y cabeceras anti-clickjacking, MIME sniffing, permisos y referrer;
- retención, exportación NDJSON, borrado/seudonimización y auditoría administrativa;
- exportaciones administrativas que excluyen hashes de credenciales, referencias cifradas y códigos de prueba;
- RLS de denegación por defecto y pruebas negativas multi-tenant;
- secret scanning y auditoría de dependencias en CI.

## Base de datos y asesores

Las 21 pruebas pgTAP específicas de esta fase pasan contra el proyecto remoto: RLS en todas las tablas públicas, aislamiento entre organizaciones, permisos owner/admin/viewer, OAuth de un solo uso, exportación, borrado y acceso exclusivo de servicio. El asesor no reporta problemas altos o críticos ni claves externas sin índice.

Permanece una advertencia agrupada para 24 RPC `SECURITY DEFINER` invocables por usuarios autenticados. Es intencionada: son operaciones atómicas que fijan `search_path`, derivan el tenant de la sesión y validan pertenencia/rol dentro de la función; las pruebas negativas cubren las operaciones nuevas. Debe revisarse cada vez que se añada una RPC. Referencia: [advisor 0029 de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

El asesor de rendimiento solo conserva índices marcados como “sin uso” porque el esquema es reciente y la recomendación operativa sobre conexiones absolutas de Auth. No se eliminarán índices de RLS, FKs, idempotencia o jobs basándose en una base todavía vacía. Referencias: [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) y [puesta en producción](https://supabase.com/docs/guides/deployment/going-into-prod).

## Riesgos residuales

- **Alto, bloqueante para apps reales:** App Attest y Play Integrity aún son puntos de extensión y no verificadores activos. No se debe presentar el tráfico como autenticado por dispositivo.
- **Medio:** la CSP compatible con Next.js permite estilos y scripts inline; migrar a nonces por petición reducirá la superficie XSS antes de producción general.
- **Medio:** las políticas y textos legales son borradores técnicos y requieren revisión jurídica por país, base legal y clientes reales.
- **Medio:** la revocación local elimina el token cifrado, pero cada proveedor debe integrarse con su endpoint de revocación cuando lo ofrezca.
