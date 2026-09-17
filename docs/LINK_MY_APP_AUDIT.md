# Auditoría de Link My App

Auditoría realizada el 2026-09-17 antes de implementar los enlaces de Attruvi.

## Fuente revisada

- Repositorio local del mismo propietario y remoto `davidtrotonda/link-my-app`.
- Revisión auditada: `e41c30e`.
- Licencia: Apache License 2.0, con archivo `NOTICE`.

No se copiaron archivos ni fragmentos del proyecto. Por tanto, Attruvi no incorpora código derivado que requiera trasladar su `NOTICE`. La licencia habría permitido reutilización con sus avisos, pero una implementación nueva era más segura y encajaba mejor con la arquitectura actual.

## Arquitectura encontrada

Link My App usa una SPA Vite/React, Firebase Realtime Database y un Cloudflare Worker. Mantiene una representación privada y otra pública de cada enlace; el Worker resuelve el slug, detecta de forma básica el sistema operativo, usa KV/Cache API y registra analítica en D1.

El flujo existente muestra una página HTML intermedia antes de abrir la tienda. El modelo principal contiene título, slug, destinos iOS/Android, fallback, estado y propietario.

## Qué se conserva como patrón conceptual

- Un slug público resuelto en el edge.
- Detección de iOS, Android y web por `User-Agent`.
- Caché en KV para evitar consultar la base en cada clic.
- Separación entre configuración privada y contrato público de resolución.

## Qué no se reutiliza

- La página intermedia, porque Attruvi debe responder con un redirect HTTP inmediato.
- Firebase, D1 y el acoplamiento a su esquema: Attruvi usa Supabase como fuente de verdad y Queue para entrega duradera.
- Reglas, configuración o código con identificadores del propietario, dominios, cuentas o datos personales.
- Fallbacks a servicios privados y valores fijados al despliegue anterior.

## Diferencias deliberadas de Attruvi

Attruvi implementa contratos nuevos, validación Zod, RPC de solo servicio para resolver enlaces, IDs de clic opacos, UTMs e identificadores `gclid`, `gbraid`, `wbraid`, `fbclid` y `ttclid`. El clic entra en Cloudflare Queue y Postgres impone una segunda barrera de idempotencia. Android recibe un Play Install Referrer correctamente codificado. AASA y `assetlinks.json` se sirven desde configuración versionada.

Este documento no reproduce secretos ni identificadores encontrados durante la auditoría.
