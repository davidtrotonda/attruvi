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

Sustituye en `App.tsx` únicamente la `appKey` pública y el endpoint. No introduzcas claves privadas. El endpoint de ejemplo no almacena datos reales.
