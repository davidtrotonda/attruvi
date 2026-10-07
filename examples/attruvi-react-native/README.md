# Ejemplo aislado de @attruvi/react-native

Aplicación generada desde la plantilla oficial de React Native 0.87.0 con New Architecture y Hermes activados. Contiene botones para simular una instalación y enviar `sign_up`, `purchase` y `subscription_started`.

Desde esta carpeta:

```bash
npm install
npm run android
```

En macOS, antes de iOS:

```bash
cd ios
bundle install
bundle exec pod install
```

El Podfile incluye las pruebas nativas del SDK y CocoaPods genera una app
anfitriona para comprobar Keychain. Después de instalar los pods,
selecciona un simulador disponible y ejecuta desde `ios`:

```bash
xcodebuild test \
  -workspace HelloWorld.xcworkspace \
  -scheme AttruviReactNative \
  -configuration Debug \
  ENABLE_DEBUG_DYLIB=NO \
  -destination 'platform=iOS Simulator,name=<nombre del simulador>'
```

Estas pruebas usan XCTest y el Keychain del simulador para comprobar la
persistencia de identificadores, el reinicio del identificador anónimo, la
identidad y su límite de tamaño. No envían eventos a servidores externos.
La apertura de Universal Links requiere una comprobación adicional con las
asociaciones del dominio y la firma de la app.
La [validación del 07-10-2026](../../docs/IOS_VALIDATION_2026-10-07.md) registra los
resultados y los ajustes de firma necesarios en el Mac usado para esa ejecución.

Sustituye en `App.tsx` únicamente la `appKey` pública y el endpoint. No introduzcas claves privadas. El endpoint de ejemplo no almacena datos reales.
