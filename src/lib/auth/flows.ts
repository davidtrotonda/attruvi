import type { SupabaseClient } from "@supabase/supabase-js";

type AuthClient = SupabaseClient["auth"];

export const publicAuthMessages = {
  invalidCredentials:
    "No hemos podido iniciar sesión. Revisa el correo y la contraseña.",
  recoveryRequested:
    "Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva.",
  resendRequested:
    "Si el registro sigue pendiente, recibirás un nuevo correo de verificación.",
  signupFailed:
    "No hemos podido completar el registro. Espera un momento y vuelve a intentarlo.",
  unavailable:
    "El acceso no está disponible en este entorno. Revisa la configuración de Supabase.",
  verificationSent:
    "Te hemos enviado un correo de verificación. Ábrelo para activar tu cuenta.",
} as const;

export async function signInWithEmail(
  auth: AuthClient,
  email: string,
  password: string,
) {
  try {
    const { data, error } = await auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      return { message: "Sesión iniciada.", ok: true } as const;
    }
  } catch {
    // La respuesta pública no distingue credenciales de fallos del proveedor.
  }

  return { message: publicAuthMessages.invalidCredentials, ok: false } as const;
}

export async function registerWithEmail(
  auth: AuthClient,
  input: {
    callbackUrl: string;
    email: string;
    name: string;
    password: string;
  },
) {
  try {
    const { data, error } = await auth.signUp({
      email: input.email,
      options: {
        data: { full_name: input.name },
        emailRedirectTo: input.callbackUrl,
      },
      password: input.password,
    });

    if (error) {
      return { message: publicAuthMessages.signupFailed, ok: false } as const;
    }

    if (data.session) {
      return {
        message: "Cuenta creada.",
        ok: true,
        verificationRequired: false,
      } as const;
    }

    return {
      message: publicAuthMessages.verificationSent,
      ok: true,
      verificationRequired: true,
    } as const;
  } catch {
    return { message: publicAuthMessages.signupFailed, ok: false } as const;
  }
}

export async function requestPasswordRecovery(
  auth: AuthClient,
  email: string,
  redirectTo: string,
) {
  try {
    await auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Mantener exactamente la misma respuesta evita enumerar cuentas.
  }

  // La respuesta es deliberadamente idéntica exista o no la cuenta.
  return { message: publicAuthMessages.recoveryRequested, ok: true } as const;
}

export async function resendEmailVerification(
  auth: AuthClient,
  email: string,
  emailRedirectTo: string,
) {
  try {
    await auth.resend({
      email,
      options: { emailRedirectTo },
      type: "signup",
    });
  } catch {
    // El mensaje y el enfriamiento son iguales para todos los resultados.
  }

  return { message: publicAuthMessages.resendRequested, ok: true } as const;
}

export async function startGoogleOAuth(
  auth: AuthClient,
  redirectTo: string,
) {
  try {
    const { error } = await auth.signInWithOAuth({
      options: {
        queryParams: { prompt: "select_account" },
        redirectTo,
      },
      provider: "google",
    });

    if (!error) {
      return { message: "Abriendo Google…", ok: true } as const;
    }
  } catch {
    // Se transforma en un único mensaje público.
  }

  return {
    message: "No hemos podido abrir el acceso con Google.",
    ok: false,
  } as const;
}

export async function updateAccountPassword(
  auth: AuthClient,
  password: string,
) {
  try {
    const { error } = await auth.updateUser({ password });
    if (!error) {
      return { message: "Tu contraseña se ha actualizado.", ok: true } as const;
    }
  } catch {
    // Se transforma en un único mensaje público.
  }

  return {
    message:
      "El enlace ha caducado o no se ha podido guardar la contraseña. Solicita uno nuevo.",
    ok: false,
  } as const;
}
