#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WITH_CLOUD="${1:-}"

cd "${PROJECT_DIR}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Aviso: este bootstrap está preparado para macOS; continuaré con las comprobaciones portables."
fi

for command_name in git node npm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Falta ${command_name}. Consulta docs/MACBOOK_SETUP.md." >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" != "24" ]]; then
  echo "Attruvi requiere Node 24. Versión detectada: $(node --version)." >&2
  exit 1
fi

if [[ ! -f package-lock.json ]]; then
  echo "No se encontró package-lock.json; ejecuta este script desde el repositorio Attruvi." >&2
  exit 1
fi

echo "Instalando dependencias fijadas por package-lock.json…"
npm ci

if [[ "${WITH_CLOUD}" == "--cloud" ]]; then
  echo "Comprobando accesos cloud existentes…"
  npx vercel whoami >/dev/null
  npx supabase projects list >/dev/null
  npx wrangler whoami >/dev/null

  echo "Enlazando Vercel y descargando el entorno Preview en .env.local…"
  npx vercel link --yes --project attruvi --scope david-troton-s-projects
  npx vercel env pull .env.local --environment=preview --yes

  echo "Enlazando el proyecto Supabase existente…"
  npx supabase link --project-ref zwyfenrebtvqceokpbdq
else
  echo "Accesos cloud omitidos. Usa: npm run bootstrap:macos -- --cloud"
fi

echo "Ejecutando validación completa y escáner de secretos…"
npm run verify
npm run security:check

echo "Mac preparado. Abre el repositorio en Codex y crea una rama desde main."
