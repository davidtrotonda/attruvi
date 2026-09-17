"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { updateAccountPassword } from "@/lib/auth/flows";
import { passwordSchema } from "@/lib/auth/schemas";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");
    const parsed = passwordSchema.safeParse(password);

    setError("");
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa la contraseña.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("El acceso no está configurado en este entorno.");
      return;
    }

    setBusy(true);
    try {
      const result = await updateAccountPassword(client.auth, parsed.data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCompleted(true);
    } finally {
      setBusy(false);
    }
  }

  if (completed) {
    return (
      <div className="reset-complete" role="status">
        <span aria-hidden="true">✓</span>
        <h1>Contraseña actualizada</h1>
        <p>Ya puedes volver a tu panel con la nueva contraseña.</p>
        <button
          className="auth-primary"
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
          type="button"
        >
          Ir al panel
        </button>
      </div>
    );
  }

  return (
    <form className="reset-form" onSubmit={handleSubmit}>
      <p className="auth-kicker">RECUPERACIÓN SEGURA</p>
      <h1>Crea una contraseña nueva</h1>
      <p>Usa al menos 10 caracteres, mayúsculas, minúsculas y un número.</p>
      <label>
        <span>Nueva contraseña</span>
        <input autoComplete="new-password" minLength={10} name="password" required type="password" />
      </label>
      <label>
        <span>Repite la contraseña</span>
        <input autoComplete="new-password" minLength={10} name="password_confirmation" required type="password" />
      </label>
      {error ? <p className="auth-alert auth-alert-error" role="alert">{error}</p> : null}
      <button className="auth-primary" disabled={busy} type="submit">
        {busy ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
