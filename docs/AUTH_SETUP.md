# Autenticación y URLs de retorno

Attruvi usa Supabase Auth con PKCE y cookies SSR. La landing y la documentación son públicas; `/dashboard`, `/onboarding` y `/api/private/**` exigen una sesión verificada.

## Variables de entorno

Configura estos nombres en Vercel para Development, Preview y Production. Los valores reales no deben guardarse en Git:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=https://www.attruvi.com
```

La clave `service_role` no se usa en el navegador ni en el flujo de acceso. Si existe para futuros procesos internos, debe permanecer solo en el servidor.

## Supabase Auth

En Authentication → URL Configuration:

- Site URL: `https://www.attruvi.com`
- Redirect URLs de producción:
  - `https://www.attruvi.com/auth/callback`
  - `https://www.attruvi.com/auth/confirm`
  - `https://www.attruvi.com/auth/reset`
- Redirect URLs de desarrollo:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/auth/reset`
  - `http://127.0.0.1:3000/auth/callback`
  - `http://127.0.0.1:3000/auth/confirm`
  - `http://127.0.0.1:3000/auth/reset`

Los parámetros `next` se conservan como query string, pero el servidor solo acepta rutas internas que empiezan por una única `/`. No se confían hosts reenviados por el cliente.

Activa Email/Password, la confirmación de correo y una frecuencia mínima de 60 segundos. La configuración local versionada exige 10 caracteres, mayúscula, minúscula y número. Para producción se necesita un SMTP propio; el proveedor de prueba de Supabase no es una entrega de correo fiable.

El flujo estándar de Supabase PKCE vuelve a `/auth/callback` con un código. `/auth/confirm` también admite plantillas personalizadas basadas en `token_hash`. Si se usan, los enlaces deben seguir este patrón:

```text
https://www.attruvi.com/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding
https://www.attruvi.com/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset
```

## Google Auth

Estado de la instancia oficial: activo en producción para usuarios externos. El cliente OAuth, su secreto y el proveedor de Supabase están configurados fuera del repositorio; el flujo público llega al selector oficial de cuentas de Google sin errores de proveedor ni de redirect URI.

En Google Auth Platform crea un cliente OAuth de tipo Web application.

Authorized JavaScript origins:

- `https://www.attruvi.com`
- `http://localhost:3000`

Authorized redirect URI:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

El valor exacto aparece en Authentication → Providers → Google dentro de Supabase. El identificador del proyecto y el secreto OAuth se configuran allí y no se publican en este repositorio. Si se configura un dominio Auth propio, usa su URL `/auth/v1/callback` en lugar de la anterior.

## Comportamiento de seguridad

- `getClaims()` valida la firma de la sesión para proteger páginas y datos; no se confía en `getSession()` para autorización de servidor.
- El proxy refresca cookies solo en rutas protegidas. Cada página, acción y API vuelve a comprobar la identidad cerca del acceso a datos.
- Registro, recuperación y reenvío muestran respuestas que no confirman si un correo ya existe.
- Los botones se bloquean durante cada envío y el reenvío de verificación tiene 60 segundos de enfriamiento, además de los límites de Supabase.
- El primer acceso llama a una RPC atómica que deriva el usuario desde `auth.uid()` y crea o recupera perfil, organización personal y membresía `owner` sin aceptar un `organization_id` del cliente.
