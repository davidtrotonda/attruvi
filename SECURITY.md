# Seguridad

## Versiones soportadas

Attruvi está en fase previa a producción. Solo la rama principal recibe correcciones; todavía no existe una versión estable con soporte de seguridad garantizado.

## Divulgación responsable

No publiques vulnerabilidades, tokens, payloads reales ni datos personales en un issue. Utiliza la opción **Report a vulnerability** de GitHub Security Advisories en este repositorio. Incluye impacto, superficie afectada, pasos mínimos con datos ficticios y una propuesta de mitigación si la tienes.

Confirmaremos la recepción cuando exista un mantenedor disponible, investigaremos de forma privada y coordinaremos la publicación después de corregir el problema. No se promete recompensa económica.

## Alcance prioritario

- bypass de RLS o aislamiento entre organizaciones;
- exposición de claves de servidor o tokens OAuth;
- ejecución o SSRF desde URLs controladas;
- replay de OAuth, ingestión o postbacks;
- lectura o borrado de datos sin autorización;
- atribución o postbacks sin consentimiento aplicable.

Ejecuta `npm run security:secrets` antes de cada push. Nunca adjuntes un `.env`, exportación de producción o captura con datos reales.
