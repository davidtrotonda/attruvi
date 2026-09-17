# Modelo de amenazas

## Activos y límites

Los activos principales son secretos de servidor, tokens OAuth, datos de atribución, eventos, ingresos y separación entre organizaciones. Navegador, SDK, enlaces entrantes e identificadores publicitarios son entradas no confiables. Next.js, Workers con secretos y funciones de servicio forman la zona privilegiada; Postgres con RLS es el límite final de autorización.

## Riesgos y mitigaciones

| Superficie | Amenaza | Riesgo inicial | Mitigación | Riesgo residual |
|---|---|---:|---|---:|
| Multi-tenant | Cambiar `organization_id` o UUID para leer otra empresa | Crítico | Organización derivada de membresía/appKey, FKs compuestas, RLS, RPC con `search_path` vacío y pruebas negativas | Bajo |
| OAuth | CSRF, estado manipulado o callback repetido | Alto | Cookie HttpOnly/SameSite, 256 bits aleatorios, hash server-side, usuario/app/proveedor, 10 minutos y consumo atómico único | Bajo |
| Tokens OAuth | Lectura desde navegador/base expuesta o sustitución de ciphertext | Crítico | Esquema privado, AES-256-GCM, IV aleatorio, ID de cuenta como AAD, llavero versionado y grants service-only | Bajo |
| Enlaces | Slug abusivo, redirect no permitido, bots, PII de red o purga repetida | Alto | destinos administrados, validación, hashes salados, Queue, límites, HMAC+timestamp+nonce y redirects sin página intermedia | Medio |
| Ingestión | appKey robada, payload gigante, replay, PII o tenant falsificado | Alto | appKey sin lectura, cuotas app/IP, límites, Zod, bloqueo PII, event IDs idempotentes, Queue y app/org derivados de la clave | Medio hasta activar attestation |
| Postbacks | Conversión falsa, doble envío, PII o envío sin permiso | Alto | outbox idempotente, señales deterministas reales, finalidad `advertising`, allowlist de campos, reintentos y estados `skipped` | Bajo |
| Privacidad | Retención indefinida o UUID presentado como anónimo | Alto | plazos por app, cron, exportación, borrado/seudonimización y explicación de que los IDs persistentes son seudónimos | Bajo |
| Web | XSS, clickjacking o filtrado de referrer | Alto | React escaping, CSP, frame-ancestors, HSTS, Permissions-Policy, nosniff y no secretos en cliente | Medio por inline CSP |

## Casos de abuso comprobados

- viewer intentando cambiar configuración;
- miembro de organización A leyendo o modificando B;
- callback OAuth consumido dos veces;
- mismo evento y misma compra repetidos;
- appKey revocada;
- lote excesivo, futuro, malicioso o con PII;
- postback sin consentimiento publicitario o sin click ID admitido;
- borrado/exportación solicitado sin rol administrativo.

Un riesgo alto o crítico nuevo bloquea la integración en apps reales hasta que exista corrección y prueba de regresión.
