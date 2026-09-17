# Contribuir a Attruvi

Gracias por ayudar a construir una atribución móvil verificable y respetuosa con la privacidad.

## Antes de enviar cambios

1. Abre un issue sin incluir datos de usuarios, credenciales ni identificadores reales.
2. Crea una rama pequeña y añade pruebas para el comportamiento nuevo.
3. Usa únicamente fixtures ficticios con dominios reservados (`example.com`, `example.invalid`) e identificadores opacos de prueba.
4. Ejecuta `npm run verify` y `npm run security:check`.
5. Si cambias Postgres, añade una migración versionada, pruebas pgTAP y documenta la decisión.

No se aceptan técnicas de fingerprinting oculto, bypass de consentimiento, secretos en cliente ni afirmaciones de atribución que no estén respaldadas por evidencia.

## Commits y pull requests

Explica el problema, la solución, las pruebas y cualquier riesgo o migración. No mezcles refactors ajenos al cambio. Al contribuir aceptas que tu aportación se distribuya bajo la licencia MIT del repositorio.

Para vulnerabilidades no abras un issue público: sigue [SECURITY.md](SECURITY.md).
