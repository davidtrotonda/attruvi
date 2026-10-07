# Validación nativa iOS — 07-10-2026

Esta ejecución complementa la validación Android del 17-09-2026. Se realiza en
los checkouts canónicos existentes, con las dependencias ya instaladas. Las tres
apps tienen trabajo local previo: los commits siguientes identifican su base,
pero no reproducen por sí solos todo el árbol de trabajo utilizado.

## Entorno y referencias

- macOS, Xcode 26.5 (`17F42`), simulador iPhone 17 Pro con iOS 26.5.
- CocoaPods 1.16.2; Ruby del sistema 2.6.10 con `RUBYOPT=-rlogger`.
- SDK Attruvi: base `1c408d2ab05a7fcf1924a43debd9682ec35cd961` más las pruebas
  XCTest incluidas en este cambio.
- Espacio libre antes de compilar: aproximadamente 735 GiB; margen mínimo: 15 GB.

| Fixture | Base Git | Dependencias instaladas |
| --- | --- | --- |
| Tourixy | `0f8be4d6a14fc72b2e54f63f564f861ad6ad0a81` | RN 0.87.0, React 19.2.8 |
| Solsuna | `3dd9166d9747d9e85cb9e8f52a098ff6de8b0aaf` | Expo 57.0.24, RN 0.86.3, React 19.2.3 |
| Rutimon | `025ce8884822f20142a28f7fa181a29a1a260d12` | Expo 57.0.26, RN 0.86.3, React 19.2.3 |

## Método

1. Construir `@attruvi/core` y `@attruvi/react-native` con TypeScript y ejecutar
   las 12 pruebas JavaScript existentes: PASS.
2. Ejecutar `npm pack --dry-run`: incluye `tests/ios/AttruviNativeTests.swift`.
3. Instalar los pods del ejemplo RN 0.87 y ejecutar el esquema
   `AttruviReactNative` con XCTest en el simulador.
4. Para Solsuna, generar iOS con `expo prebuild --platform ios --no-install
   --skip-dependency-update react,react-native`, preservando su manifiesto previo.
5. En los fixtures, añadir temporalmente el pod desde el SDK local y compilar
   los esquemas completos de las apps. No se cambian sus inicializaciones
   JavaScript ni se envían conversiones reales.

La declaración temporal después de `use_native_modules!` es:

```ruby
pod 'AttruviReactNative', :path => ENV.fetch('ATTRUVI_IOS_VALIDATION_PATH') if ENV['ATTRUVI_IOS_VALIDATION_PATH']
```

Desde el directorio iOS correspondiente:

```bash
RUBYOPT=-rlogger ATTRUVI_IOS_VALIDATION_PATH=/ruta/Attruvi/packages/react-native pod install
xcodebuild build -workspace <app>.xcworkspace -scheme <app> \
  -configuration Debug -destination 'platform=iOS Simulator,name=<simulador>' \
  -derivedDataPath <temporales>/<app>-derived-data CODE_SIGNING_ALLOWED=NO
```

Tourixy usa CocoaPods con React Native Core desde fuentes; las apps Expo usan
React Native Core precompilado. Ruby 2.6 no dispone de `Array#filter_map`, por lo
que Expo avisa al leer configuraciones de módulos precompilados y utiliza sus
fuentes como fallback. Un `pod install` satisfactorio no implica por sí solo
que la compilación de la app haya pasado.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| TypeScript de core y SDK React Native | PASS |
| Pruebas JavaScript del SDK | 12/12 PASS |
| XCTest nativo RN 0.87 en simulador iOS 26.5 | 5/5 PASS, cero fallos y cero pruebas omitidas |
| SDK RN 0.87 para dispositivo ARM64, sin firma | PASS |
| SDK RN 0.86.3 para dispositivo ARM64, usando los pods de Rutimon, sin firma | PASS |
| Tourixy completa con SDK, simulador x86_64, Debug sin firma | PASS |
| Solsuna completa con SDK, simulador x86_64, Debug sin firma | PASS |
| Rutimon completa con SDK, simulador x86_64, Debug sin firma | PASS |

Las pruebas XCTest verifican persistencia de IDs entre instancias, reinicio del
ID anónimo conservando la instalación, guardado/borrado de identidad, rechazo de
32.770 bytes UTF-8 conservando el valor anterior y respuestas nulas para las
señales que iOS no ofrece mediante el puente. El resumen de Xcode registra
`Passed`, `totalTestCount=5`, `failedTests=0`, `skippedTests=0`.

Los tres builds terminan con `BUILD SUCCEEDED`; las pruebas terminan con
`TEST SUCCEEDED`. El módulo Swift y el puente Objective-C se compilaron dentro
de los proyectos, además de las comprobaciones ARM64 separadas del SDK.

### Evidencia del enlace en las apps

Se comprobó con `nm` que la biblioteca de código de cada app contiene los símbolos
`AttruviNative`. En Debug, el ejecutable de arranque delega en esta `.debug.dylib`:

| App | Bytes de código | SHA-256 de `.debug.dylib` |
| --- | ---: | --- |
| Tourixy | 53302544 | `90cf8f36868b4330be8b63c11cd300330fe5eabc66222f0808ce615a398769ae` |
| Solsuna | 110648072 | `3964e49e2fdde7f328e9069ba9371f51fc5715d54d790108297b3875ac562055` |
| Rutimon | 117935424 | `f51a0b6063023249423fbce456920245dee75c552ba218732cf17c7187ff8a10` |

## Incidencias del entorno de pruebas

- Las primeras ejecuciones encontraron metadatos de Finder en los bundles
  generados y el firmador local los rechazó. Se limpiaron los atributos de esos
  artefactos; no se modificaron certificados ni credenciales.
- XCTest sin app anfitriona devolvió `errSecMissingEntitlement` (`-34018`) al
  acceder a Keychain. El test spec ahora usa `requires_app_host = true`, siguiendo
  el mecanismo de [CocoaPods](https://guides.cocoapods.org/using/test-specs.html).
  La [documentación de Apple](https://developer.apple.com/documentation/security/errsecmissingentitlement)
  relaciona ese error con los permisos de acceso de la app al Keychain.
- El primer arranque de XCTest se bloqueó al abrir el bundle desde Documents.
  Para diagnosticarlo se ejecutó una copia del artefacto compilado dentro del
  área temporal del simulador. No se copiaron repositorios ni `node_modules`.
- ExpoModulesJSI ejecuta un `xcodebuild` interno que no hereda la opción
  `CODE_SIGNING_ALLOWED=NO` del build principal. Para los builds sin firma se
  utilizó un wrapper temporal en `PATH` que añade esa opción al comando interno,
  conservando intactas las fuentes de Expo y de las apps.
- Para obtener los permisos simulados de Keychain, la app anfitriona se enlaza
  con la firma local activada: Xcode genera el identificador simulado en el
  ejecutable. Firmarla manualmente con permisos de dispositivo no sustituye ese
  paso. Se utiliza `ENABLE_DEBUG_DYLIB=NO` de forma consistente para la app y
  las pruebas.
- La ejecución satisfactoria usa un wrapper de `codesign` que limpia los atributos
  únicamente de los productos generados antes de delegar en `/usr/bin/codesign`.
  Se selecciona mediante `CODESIGN`, mecanismo del
  [build system de Swift/Xcode](https://github.com/swiftlang/swift-build/blob/main/Sources/SWBCore/SpecImplementations/Tools/CodeSign.swift).
  El script generado por CocoaPods para las pruebas también se ajusta localmente
  para invocar ese wrapper. No se cambian los certificados ni la seguridad del Mac.

## Alcance pendiente

- No hay un iPhone conectado ni identidades válidas de firma Apple en este Mac.
  La instalación firmada y la apertura real de Universal Links quedan pendientes.
- `workers/links/src/association-config.ts` tiene las listas Apple y Android
  vacías. Antes de probar los enlaces hay que configurar las asociaciones de
  las apps y verificar AASA/Associated Domains en el dominio real.
- Las compilaciones comprueban el enlace del módulo nativo con estas dependencias;
  no equivalen a instrumentar altas, compras o suscripciones en las apps.
- Esta ejecución no vuelve a validar los servicios de producción ni publica una
  nueva versión de ninguna app.

## Cierre y espacio

Se restauraron los once archivos nativos versionados que CocoaPods modificó en
Tourixy, Rutimon y el ejemplo de Attruvi. Los manifiestos de las apps conservan
su trabajo previo. La declaración temporal del SDK se retiró del iOS generado
para Solsuna. No se conserva instrumentación nueva del SDK en esas apps.

Se eliminaron resultados fallidos, bundles de prueba redundantes, diagnósticos,
wrappers temporales y copias de respaldo ya restauradas. La app anfitriona se
desinstaló del simulador y el simulador se apagó al terminar.

Se conservan para reutilizar dependencias y compilaciones:

- `Documents/Codex/_temporales/attruvi-ios-validation-20261007`: aproximadamente
  12 GiB de DerivedData, builds satisfactorios y evidencia de pruebas.
- Pods del ejemplo Attruvi: 1,3 GiB; Tourixy: 692 MiB; Rutimon: 1,3 GiB.
- iOS generado para Solsuna, incluidos sus Pods: 1,3 GiB.
- Cachés compartidas de CocoaPods/React Native y el framework de Expo construido
  dentro de las dependencias existentes.

Espacio libre al cierre: aproximadamente 706 GiB. No se crearon clones ni
worktrees, ni se copiaron o reinstalaron las dependencias npm. El ejemplo reutiliza
las existentes mediante enlaces simbólicos locales ignorados por Git.
