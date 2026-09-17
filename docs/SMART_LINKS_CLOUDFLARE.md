# Cloudflare para enlaces inteligentes

Esta guía usa únicamente placeholders. No pegues secretos en `wrangler.jsonc`, Git, Vercel ni el navegador.

## Recursos

Desde la raíz del repositorio, con la cuenta correcta ya autenticada:

```bash
npx wrangler kv namespace create LINKS_KV
npx wrangler queues create attruvi-link-clicks
npx wrangler queues create attruvi-link-clicks-dead-letter
```

Sustituye el ID ficticio de `workers/links/wrangler.jsonc` por el ID de KV obtenido. Los nombres de Queue ya están declarados. La misma implementación actúa como productor y consumidor.

Guarda los tres secretos directamente en Cloudflare:

```bash
cd workers/links
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CLICK_HASH_SALT
npx wrangler secret put LINKS_SYNC_TOKEN
```

- `SUPABASE_SERVICE_ROLE_KEY`: solo el Worker; permite resolver configuración e insertar lotes de clics.
- `CLICK_HASH_SALT`: valor aleatorio largo y exclusivo del entorno; se usa antes de guardar hashes de red y agente.
- `LINKS_SYNC_TOKEN`: valor aleatorio compartido únicamente con el servidor Next.js para invalidar KV al editar un enlace.

Configura `SUPABASE_URL` como variable no secreta y despliega:

```bash
npm run types
npm test
npm run build
npx wrangler deploy
```

## Dominio y DNS

Reserva un subdominio, por ejemplo `links.example.com`, y añádelo como **Custom Domain** del Worker. Puede declararse después de sustituir el placeholder:

```json
{
  "routes": [
    { "pattern": "links.example.com", "custom_domain": true }
  ]
}
```

Cloudflare crea y administra el registro DNS y el certificado del Custom Domain. No dejes otro registro A/AAAA/CNAME incompatible en ese mismo hostname. El hostname debe coincidir con el dominio asociado que declaren iOS y Android.

No se versionan `account_id`, zone IDs, IDs reales de KV, dominios privados ni secretos.

## Asociaciones nativas

Edita `workers/links/src/association-config.ts` al preparar una app:

```ts
export const associationConfig = {
  android: [{
    packageName: "com.example.app",
    sha256CertFingerprints: ["AA:BB:…:FF"],
  }],
  apple: [{
    appIDs: ["TEAMID.com.example.app"],
    components: [{ "/": "/*" }],
  }],
  version: 1,
};
```

Son identificadores públicos de asociación, no credenciales. Verifica las huellas del certificado de producción y pruebas. El Worker sirve:

- `/.well-known/apple-app-site-association`
- `/apple-app-site-association`
- `/.well-known/assetlinks.json`

El SDK recibe la misma URL cuando Universal Links/App Links abre una app instalada. Si el sistema no abre la app, el Worker registra el clic y responde `302` a la tienda o fallback; nunca renderiza “redirigiendo”.

## Variables de Vercel

Añade a todos los entornos necesarios:

```text
NEXT_PUBLIC_SMART_LINK_BASE_URL=https://links.example.com
ATTRUVI_LINKS_WORKER_URL=https://links.example.com
ATTRUVI_LINKS_SYNC_TOKEN=<mismo secreto, solo servidor>
```

Solo la primera es pública. No uses el prefijo `NEXT_PUBLIC_` para el token ni para la clave `service_role`.

## Verificación sin registrar un clic real

El método `HEAD` comprueba destino sin crear analítica:

```bash
curl -I -A "Mozilla/5.0 (iPhone)" https://links.example.com/slug-de-prueba
curl -I -A "Mozilla/5.0 (Linux; Android 15)" https://links.example.com/slug-de-prueba
```

El botón **Probar** del dashboard usa `attruvi_test=1`: registra el clic como prueba, pero lo excluye del contador válido. Comprueba además la salud con `GET /health`, la cola, su dead-letter queue y los logs estructurados antes de dirigir tráfico publicitario.

## Operación y fallos

- KV guarda resoluciones positivas y negativas; una edición dispara purga autenticada.
- Queue acepta el clic antes del redirect y entrega lotes de hasta 100 a Supabase.
- Postgres deduplica por `(app_id, dedupe_key)` aunque Queue reintente.
- Tras cinco reintentos, el mensaje pasa a la dead-letter queue para inspección y reproceso.
- El Worker guarda hashes, no IP ni `User-Agent` en claro. Los clics de bots y pruebas quedan marcados.
- Si Supabase, Queue o la configuración fallan, el Worker falla cerrado con JSON y no inventa una atribución.
