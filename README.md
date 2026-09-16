# Attruvi

Attruvi es un proyecto de atribución móvil de código abierto para aplicaciones React Native.

Web: [attruvi.com](https://attruvi.com)

El objetivo es conectar campañas publicitarias con instalaciones, compras, ingresos y retención, y devolver conversiones válidas a Google Ads, Meta Ads y TikTok Ads.

> Estado: primera etapa pública. Todavía no está listo para producción.

## Alcance inicial

- SDK para React Native en iOS y Android.
- Atribución de instalaciones y eventos de compra.
- Medición de ingresos, ROAS, LTV y retención.
- Postbacks server-side para Google Ads, Meta Ads y TikTok Ads.
- Despliegue propio y trazabilidad completa de los datos.

## Landing

La web pública está construida con Next.js y se despliega en Vercel.

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Estructura prevista

El repositorio evolucionará hacia un monorepo con el SDK de React Native, la API de atribución, el panel y los conectores publicitarios.

## Licencia

MIT
