# Continuar Attruvi desde un MacBook

Esta guía deja un Mac nuevo listo para trabajar con Codex desde la última versión de Attruvi sin copiar secretos entre ordenadores.

## Fuente de verdad

- Código y documentación: `https://github.com/davidtrotonda/attruvi`.
- Rama estable: `main`.
- Web: proyecto `attruvi` de Vercel.
- Base de datos y Auth: proyecto `Attruvi` de Supabase, región Europa.
- Edge: Workers `attruvi-links` y `attruvi-ingest` de Cloudflare; sus variantes de staging terminan en `-staging`.
- Secretos: permanecen cifrados en Vercel, Supabase y Cloudflare. Google Drive contiene una copia de esta guía, no valores secretos.

Attruvi es una plataforma web y un SDK, no una app firmada para App Store o Google Play. Por ello este repositorio no necesita keystore Android, certificado Apple, perfil de aprovisionamiento ni clave `.p8`. Esos archivos pertenecerían a las apps cliente que instalen el SDK, no a Attruvi.

## 1. Preparar macOS

Instala Xcode desde Apple si vas a validar el SDK en iOS y ejecuta una vez:

```bash
xcode-select --install
```

Instala Homebrew, Git, GitHub CLI y Node 24. Con `nvm`:

```bash
brew install git gh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 24
nvm use 24
```

No instales globalmente Supabase, Wrangler ni Vercel: el repositorio fija sus versiones y se ejecutan con `npx`.

## 2. Autenticarse y clonar

```bash
gh auth login
git clone https://github.com/davidtrotonda/attruvi.git
cd attruvi
git switch main
git pull --ff-only
```

Configura la identidad de Git si el Mac todavía no la tiene:

```bash
git config --global user.name "David Trotonda"
git config --global user.email "davidtrotonda@users.noreply.github.com"
```

## 3. Arranque local reproducible

```bash
npm run bootstrap:macos
```

El script exige Node 24, instala exactamente `package-lock.json`, ejecuta el escáner de secretos y valida todo el repositorio. No descarga ni imprime secretos.

Para preparar también los accesos cloud:

```bash
npx vercel login
npx supabase login
npx wrangler login
npm run bootstrap:macos -- --cloud
```

El modo `--cloud` enlaza el proyecto Vercel existente, obtiene las variables del entorno Preview en `.env.local`, enlaza Supabase y comprueba el acceso a Cloudflare. `.env.local`, `.vercel`, `supabase/.temp` y `.wrangler` están ignorados por Git.

No uses `--cloud` desde una cuenta diferente: comprueba primero que ves los proyectos existentes. El script nunca crea proyectos, bases de datos, Workers, KV ni colas.

## 4. Desarrollo con Codex

Abre en Codex la carpeta clonada y usa este primer mensaje:

```text
Trabaja en el repositorio actual de Attruvi. Lee AGENTS.md, CLAUDE.md,
README.md, docs/START_HERE.md, docs/ARCHITECTURE.md,
docs/BUILD_STATUS.md y docs/DECISIONS.md antes de cambiar nada.
Comprueba git status y trabaja desde la última versión de main en una rama
nueva. No muestres ni copies secretos. Implementa, prueba con npm run verify
y npm run security:check, y no despliegues producción salvo que te lo pida.
```

Crea una rama por cambio:

```bash
git switch main
git pull --ff-only
git switch -c codex/descripcion-corta
```

Antes de subir:

```bash
npm run verify
npm run security:check
git status --short
```

## 5. Variables y secretos

`.env.example` enumera todas las variables aceptadas, pero no contiene valores. En local:

- `npx vercel env pull .env.local --environment=preview --yes` recupera la configuración autorizada.
- Los secretos de Google OAuth permanecen en Supabase Auth.
- Los secretos de los Workers permanecen en Cloudflare y pueden comprobarse por nombre con `wrangler secret list`; Cloudflare no permite recuperarlos en claro.
- Las credenciales de Google Ads, Meta Ads y TikTok Ads siguen pendientes y no deben inventarse.
- Los ejemplos locales de Workers están en `workers/*/.dev.vars.example`; copia el archivo como `.dev.vars` únicamente si vas a ejecutar el Worker localmente.

Nunca subas `.env.local`, `.dev.vars`, tokens de CLI, cookies, certificados ni exports de secretos a GitHub o Drive. Si alguna clave se pierde, se rota en el proveedor; no se recupera desde una copia insegura.

## 6. Supabase, Cloudflare y Vercel

Supabase:

```bash
npx supabase projects list
npx supabase link --project-ref zwyfenrebtvqceokpbdq
npx supabase migration list
```

Los archivos de `supabase/migrations` son la fuente reproducible para crear una base nueva. La producción existente recibió algunas migraciones mediante la API de Supabase y sus identificadores remotos pueden no coincidir literalmente con los nombres locales. No ejecutes `supabase db push` directamente contra producción ni repares el historial para ocultar esa diferencia. Valida una migración nueva en local/staging y aplícala de forma explícita mediante Supabase MCP, conservando el mismo SQL versionado en Git.

Cloudflare:

```bash
npx wrangler whoami
npx wrangler secret list --name attruvi-links
npx wrangler secret list --name attruvi-ingest
```

Vercel:

```bash
npx vercel whoami
npx vercel link --yes --project attruvi --scope david-troton-s-projects
npx vercel env pull .env.local --environment=preview --yes
```

Para despliegues y rollback sigue `docs/PRODUCTION_RUNBOOK.md`. No crees recursos duplicados si el comando de enlace falla: corrige primero la cuenta o el equipo seleccionado.

## 7. Comprobación final

```bash
npm run verify
npm run security:check
npm run dev
```

Después abre `http://localhost:3000`. La producción se comprueba sin secretos en:

- `https://www.attruvi.com/api/health`
- `https://www.attruvi.com/api/health?deep=1`

Si estas comprobaciones pasan, el Mac está listo para continuar Attruvi desde la misma versión que GitHub.
