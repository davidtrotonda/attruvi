# Compatibilidad del SDK React Native

Actualizado: 2026-09-17.

## Manifiestos auditados

La elección de APIs se hizo leyendo copias locales reales y recientes de las tres aplicaciones. No se copiaron secretos, identificadores de proveedor ni lógica privada.

| App | React Native | React | Entorno | New Architecture | Hermes | AsyncStorage | Native mínimo observado |
|---|---:|---:|---|---|---|---:|---|
| Tourixy | 0.87.0 | 19.2.8 | React Native CLI | activada | activado | 3.1.1 | Android 24; iOS usa el mínimo de RN 0.87 |
| Solsuna | 0.86.3 | 19.2.3 | Expo 57.0.21 | activada por la base Expo | activado | 2.2.0 | lo determina Expo Prebuild |
| Rutimon | 0.86.3 | 19.2.3 | Expo 57.0.23 | activada | activado | 2.2.0 | iOS 16.4 en el proyecto generado |

También se comprobaron los identificadores de plataforma y los esquemas de deep link para asegurar que el SDK no exige renombrar las apps.

## Decisiones derivadas

- Peer range objetivo: `react-native >=0.86.3 <0.88`, React 19 y AsyncStorage `>=2.2.0 <4`. La prueba empaquetada se ejecutó con 0.87.0; 0.86.3 queda respaldado por la auditoría de las apps, no por una compilación nativa en este host.
- El paquete usa autolinking estándar, Kotlin y Swift. El módulo clásico se carga por `TurboModuleRegistry` mediante la capa oficial de interoperabilidad de New Architecture; no modifica `MainApplication`, `AppDelegate` ni los proyectos a mano.
- Android hereda `compileSdk`, `targetSdk` y `minSdk` de la app; el fallback mínimo es API 24, igual que Tourixy.
- El pod declara iOS 15.1. Rutimon, con iOS 16.4, queda por encima de ese mínimo.
- Expo requiere Prebuild/EAS o una development build porque hay código nativo. Expo Go no es compatible.

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| TypeScript estricto contra tipos de React Native 0.87 | superado |
| Unitarias de cola, consentimiento, sesiones, deep links e idempotencia | 9/9 superadas |
| `npm pack` e inventario de archivos nativos | superado; tarball instalable generado |
| Autolinking en proyecto limpio RN 0.87 con New Architecture | Android e iOS detectados desde el tarball |
| Compilación Android RN 0.87 | no ejecutable en este Windows: no hay JDK ni Android SDK instalados |
| Compilación iOS | no ejecutable desde Windows; podspec y fuentes se validan estáticamente |

No se amplía el rango de compatibilidad hasta ejecutar esas mismas pruebas con otra versión.
