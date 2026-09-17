# Empieza aquí

Attruvi te dice de qué anuncio llega una instalación, qué hace después ese usuario y cuánto valor genera. También puede devolver conversiones válidas a Google, Meta y TikTok cuando configures sus credenciales.

## Si solo quieres probarlo

1. Entra en `https://www.attruvi.com`.
2. Crea una cuenta o usa Google si el proveedor está activado.
3. Crea tu primera app React Native en el onboarding.
4. Abre **Configurar** y genera una appKey de development.
5. Sigue “Hazlo con IA” para instalar `@attruvi/react-native`.
6. Crea un enlace de prueba y comprueba clic, primera apertura y compra en el Debugger.
7. Añade un coste manual para ver CPI, CAC y ROAS sin conectar todavía ninguna red.

La appKey es pública, revocable y limitada a una app/entorno. No es una clave de Supabase ni concede lectura.

## Si vas a desplegar tu propia instancia

Lee en este orden:

1. `docs/ARCHITECTURE.md`
2. `docs/SELF_HOSTING.md`
3. `docs/AUTH_SETUP.md`
4. `docs/SMART_LINKS_CLOUDFLARE.md`
5. `docs/PRODUCTION_RUNBOOK.md`
6. `docs/SECURITY_AUDIT.md`

Ejecuta:

```bash
npm install
npm run verify
npm run security:check
```

Carga secretos únicamente en Vercel, Supabase y Cloudflare. `supabase/seed.sql` contiene datos ficticios y solo se carga en demo/staging, nunca en producción.

## Qué funciona sin credenciales publicitarias

- Auth, onboarding y aislamiento por organización.
- enlaces inteligentes y SDK React Native;
- instalaciones, sesiones, registro, compras y suscripciones;
- costes manuales/CSV y métricas;
- atribución explicable;
- postbacks en dry-run o `skipped` con razón.

Google Ads, Meta Ads y TikTok Ads aparecen como **Pendiente de credenciales** hasta recibir sus Client IDs/Secrets y, cuando corresponda, developer token, IDs de conversión/dataset/event source y aprobación del proveedor.

## Límites que debes conocer

- iOS no permite prometer atribución determinista si no entrega una señal oficial.
- App Attest y Play Integrity están preparados pero todavía no verifican dispositivos.
- Los ingresos son declarados, no verificados, hasta integrar App Store, Google Play o RevenueCat.
- Universal Links/App Links requieren un dominio asociado estable y builds reales de iOS/Android.
- Los textos legales son borradores técnicos y requieren revisión jurídica antes de uso comercial.
