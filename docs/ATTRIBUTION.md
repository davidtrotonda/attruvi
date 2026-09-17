# Cómo atribuye Attruvi

Attruvi intenta responder una pregunta concreta: **qué evidencia conecta una instalación o una
reactivación con un anuncio**. No convierte una suposición en una certeza. Cada decisión guarda el
método, la confianza, la evidencia resumida, la ventana utilizada, la fecha y la versión de reglas.

## Prioridad de la evidencia

1. `click_id` recibido directamente por Universal Link o App Link.
2. Android Play Install Referrer con `click_id` o identificador oficial de red.
3. Identificador oficial de una red, cuando está disponible y existe consentimiento válido.
4. Coincidencia probabilística limitada, solo si un administrador la activa con base legal documentada.
5. Fallback orgánico cuando no existe evidencia suficiente.

Dentro del mismo nivel gana el último clic no orgánico válido. La adquisición y la reactivación se
calculan por separado: una instalación conserva su origen aunque una sesión posterior llegue desde
otro anuncio.

## Exactitud real por plataforma y método

| Plataforma | Método | Cómo se presenta | Límites |
|---|---|---|---|
| Android e iOS | `click_id` directo entregado a la app | Determinista, confianza alta | Requiere que el sistema abra la app con la URL y entregue el identificador íntegro. |
| Android | Play Install Referrer con `click_id` | Determinista, confianza alta | Solo funciona cuando Google Play devuelve el referrer y no ha expirado la ventana. |
| Android | Play Install Referrer con ID oficial de red | Determinista respecto a esa señal | Depende de que la red y Play entreguen un identificador que coincida. |
| Android e iOS | ID oficial de Google, Meta o TikTok | Determinista respecto a la coincidencia exacta | Solo se usa con consentimiento y cuando la plataforma permite recibir y relacionar esa señal. |
| Android e iOS | Coincidencia temporal limitada | **No determinista**, confianza moderada | Desactivada por defecto. Exige consentimiento, base legal, dos hashes efímeros y una ventana máxima de 60 minutos. No crea un fingerprint persistente. |
| iOS | Sin señal oficial o directa | Orgánico / evidencia insuficiente | “Orgánico” significa que Attruvi no pudo demostrar otro origen; no demuestra que el usuario nunca viera un anuncio. |

La privacidad de Apple y las restricciones de cada red pueden impedir una atribución individual. En
ese caso Attruvi no afirma exactitud determinista. Para medición agregada deben utilizarse además los
mecanismos oficiales de Apple y de cada plataforma cuando estén disponibles.

## Coincidencia probabilística

Está desactivada en una app nueva. Al activarla se exige una base legal escrita. El Worker reduce la
IP a un prefijo, aplica el mismo salt secreto que el Worker de enlaces y solo envía SHA-256 del prefijo
y del agente de usuario. Postgres exige consentimiento `granted`, dos coincidencias, una ventana corta
y la regla activa. Nunca se guardan IP ni agente de usuario en claro, y los hashes no se utilizan como
identificador de usuario.

## Explicación y correcciones

El panel **Atribución** muestra el candidato ganador, los candidatos que perdieron, la confianza y el
motivo. Una versión nueva de reglas puede ejecutarse en `dry-run` para comparar sin modificar datos.
Las correcciones manuales requieren rol owner/admin y un motivo; la decisión anterior permanece en el
historial y el cambio se añade a `audit_log`.

Servicios principales:

- `attribute_installation`: evalúa y persiste adquisición o reactivación de forma idempotente.
- `read_sdk_attribution`: devuelve al SDK solo la adquisición de su propia instalación y exige token.
- `recalculate_personal_attribution`: compara o aplica otra versión de reglas.
- `correct_personal_attribution`: corrección administrativa auditada.
- `get_attribution_explanation`: explicación completa para el dashboard.
