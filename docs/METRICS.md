# Métricas de Attruvi

Attruvi calcula las métricas desde los clics, costes, instalaciones, sesiones e ingresos originales. Los porcentajes y costes unitarios no se guardan como promedios: se vuelven a calcular dividiendo los totales del periodo elegido.

## Cómo leer una fila

Una fila diaria representa una **cohorte de adquisición**: las instalaciones cuya primera apertura ocurrió ese día en la zona horaria configurada para la app. Attruvi genera filas separadas para app, fuente, campaña, grupo y anuncio, además de entorno, plataforma y moneda.

- `metric_date`: fecha local de la primera apertura. No es la fecha UTC del servidor.
- Ventanas D1, D7, D30 y D90: días naturales locales. D7 incluye desde D0 hasta el final de D7 para ingresos; la retención D7 exige actividad exactamente en el día natural D7.
- Una cohorte solo entra en el denominador D7 cuando D7 ha terminado. Lo mismo se aplica a D1, D30 y D90.
- `data_through_at`: instante UTC hasta el que se observaron datos raw.
- `metric_version`: versión de las fórmulas. Una versión nueva puede convivir con la anterior y compararse antes de activarse.
- Si el denominador es cero, el resultado es `—` (`NULL`), nunca cero ni infinito.

## Definiciones exactas

| Métrica | Qué significa | Fórmula | Ejemplo y límites |
|---|---|---|---|
| Gasto | Coste importado o manual en la moneda original | `Σ spend_minor` | 10.000 unidades menores en EUR son 100,00 €. Nunca se mezclan monedas ni se convierten sin una tasa fechada. |
| Clics | Clics reportados por Google/Meta/TikTok; para afiliado, influencer, orgánico, otro o manual se usan clics no bot de enlaces Attruvi | `Σ clicks` | Los clics propios no se suman otra vez a una fuente publicitaria con reporting para evitar duplicados. |
| Instalaciones | Instalaciones distintas de la cohorte | `COUNT(DISTINCT installation_id)` | Una reinstalación es otra instalación; el usuario puede seguir siendo el mismo. |
| CPI | Coste por instalación | `Σ gasto / Σ instalaciones` | 100 € / 20 = 5 €. Sin instalaciones se muestra `—`. |
| Usuarios registrados | Usuarios de la cohorte con al menos un `sign_up` observado | `COUNT(DISTINCT app_user_id)` | Dos eventos de registro del mismo usuario cuentan una vez. |
| Compradores | Usuarios con al menos un apunte positivo de compra o suscripción | `COUNT(DISTINCT app_user_id)` | Un reembolso total no borra el hecho histórico de que el usuario compró. |
| CAC | Coste por comprador adquirido | `Σ gasto / Σ compradores` | No es gasto dividido por número de transacciones. |
| Compras | Compras, inicios y renovaciones de suscripción positivas | `COUNT(ledger entry positiva)` | Los reembolsos son apuntes negativos y no incrementan este contador. |
| Ingresos | Ingreso reportado neto observado | `Σ revenue_reported_minor` | Compra 50 € y reembolso −10 € = 40 €. El ingreso verificado se conserva separado en raw. |
| ROAS | Retorno del gasto publicitario | `Σ ingresos / Σ gasto` | 40 € / 100 € = 0,40×. Con gasto cero se muestra `—`. Puede ser negativo por reembolsos. |
| Retención D1/D7/D30 | Instalaciones elegibles con una sesión en el día exacto N | `Σ retained_DN / Σ eligible_DN` | No se incluye una instalación de hace tres días en D7. |
| Sesiones por usuario | Intensidad observada en la cohorte | `Σ sesiones / Σ usuarios de cohorte` | Se usa usuario adquirido, no solo usuario activo, para no inflar el resultado. |
| Conversión a registro | Instalaciones que llegaron a usuario registrado | `Σ registrados / Σ instalaciones` | Se calcula con sumas del periodo. |
| Conversión a comprador | Instalaciones que llegaron a comprador | `Σ compradores / Σ instalaciones` | Un usuario compartido entre dos instalaciones se deduplica dentro de cada grupo consultado. |
| Conversión a compra | Transacciones positivas por instalación | `Σ compras / Σ instalaciones` | Puede superar 100 % si hay renovaciones o compras repetidas. |
| LTV observado D7/D30/D90 | Ingreso neto dentro de D0…DN por usuario de cohorte madura | `Σ revenue_DN / Σ usuarios elegibles_DN` | Incluye reembolsos ocurridos dentro de la ventana. No es una predicción. |
| LTV observado lifetime | Ingreso neto observado hasta `data_through_at` | `Σ ingresos / Σ usuarios de cohorte` | Cohortes antiguas han tenido más tiempo para acumular valor; debe interpretarse junto con su edad. |
| Tasa de desinstalación inferida | Instalaciones con una inferencia activa basada en una señal válida | `Σ uninstall_inferred / Σ instalaciones` | Siempre aparece como **inferida**. No equivale a una desinstalación confirmada. |

## Identidad, atribución y datos tardíos

Los usuarios anónimos participan desde la instalación. Cuando `identify` los relaciona de forma segura con un usuario conocido, el historial permanece unido y los agregados se pueden recalcular. Attruvi no fusiona dos identidades conocidas diferentes.

Cada resultado conserva la atribución de adquisición vigente: `source → campaign → ad_group → ad`. El nivel `app` permite obtener totales exactos sin sumar niveles que se solapan. El filtro de plataforma excluye gasto sin plataforma conocida; Attruvi no reparte ese gasto inventando una proporción.

Una inserción, corrección o borrado en instalaciones, atribuciones, sesiones, ingresos, desinstalaciones inferidas, costes o clics marca la fecha de cohorte como pendiente. El job incremental reclama esas fechas, recalcula un rango acotado desde raw, actualiza la versión activa y después invalida la caché. El reconciliador vuelve a ejecutar la fórmula raw y compara un hash de cada grano con el rollup almacenado.

## Reproducibilidad y operación

- Fuente de verdad: tablas raw; `daily_metrics` se puede borrar y reconstruir.
- Dinero: `bigint` en unidades menores; los ratios usan `numeric` de PostgreSQL.
- Periodos: inclusivos (`from <= metric_date <= to`).
- Rango máximo de recálculo por llamada: 367 días; la consulta permite hasta 10 años.
- Caché: solo contiene rollups ya autorizados por app, dura como máximo una hora y se expira inmediatamente después del recálculo.
- Seguridad: el SDK no puede leer métricas. Las escrituras y jobs usan `service_role`; los usuarios consultan únicamente organizaciones de las que son miembros.

## Comprobación manual incluida

La prueba `supabase/tests/metrics_engine_test.sql` usa dos instalaciones, 100,00 € de gasto, una compra de 50,00 € y un reembolso de 10,00 €. El resultado esperado es CPI 50,00 €, CAC 100,00 €, revenue 40,00 €, ROAS 0,40×, retención D1/D7 50 %, LTV D7/D30/D90/lifetime 20,00 € y desinstalación inferida 50 %. Sus 33 assertions también comprueban división por cero, aislamiento entre organizaciones, datos tardíos, reconciliación y preservación de raw.

El benchmark `supabase/benchmarks/metrics_rollup.sql` expande un millón de instalaciones sintéticas a los cinco niveles jerárquicos y ejecuta el mismo patrón de agregación. Su resultado depende del tamaño y carga de Postgres; por eso el tiempo medido debe registrarse junto con fecha y entorno, no presentarse como una garantía de producción.

Medición del 17-09-2026 en el proyecto Supabase de desarrollo: 1.000.000 de hechos se expandieron a 5.000.000 de filas y 80.370 grupos en **5,335 s**. PostgreSQL usó 7,1 MB de memoria para el `HashAggregate` y 36 MB temporales en disco. Es una medición reproducible del núcleo de agrupación, no una promesa de latencia end-to-end ni una prueba de ingestión concurrente.
