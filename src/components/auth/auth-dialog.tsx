"use client";

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  publicAuthMessages,
  registerWithEmail,
  requestPasswordRecovery,
  resendEmailVerification,
  signInWithEmail,
  startGoogleOAuth,
} from "@/lib/auth/flows";
import { emailSchema, registrationSchema } from "@/lib/auth/schemas";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AuthDialogMode = "forgot" | "login" | "register";

const resendCooldownSeconds = 60;

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M21.35 12.24c0-.72-.06-1.25-.2-1.8H12v3.3h5.37a4.72 4.72 0 0 1-1.99 3.04l-.02.11 2.9 2.25.2.02c1.84-1.7 2.89-4.2 2.89-6.92Z" fill="#4285F4" />
      <path d="M12 21.75c2.63 0 4.84-.87 6.46-2.59l-3.08-2.38c-.82.56-1.93.95-3.38.95-2.53 0-4.68-1.7-5.45-4.06l-.1.01-3.02 2.34-.04.1A9.75 9.75 0 0 0 12 21.75Z" fill="#34A853" />
      <path d="M6.55 13.67A5.93 5.93 0 0 1 6.23 12c0-.58.11-1.14.31-1.67v-.11L3.5 7.84l-.1.05A9.73 9.73 0 0 0 2.25 12c0 1.48.34 2.88 1.14 4.11l3.16-2.44Z" fill="#FBBC05" />
      <path d="M12 6.27c1.83 0 3.06.79 3.76 1.44l2.76-2.69C16.83 3.45 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.61 5.39l3.15 2.44C7.32 7.98 9.47 6.27 12 6.27Z" fill="#EA4335" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6.5h16v11H4zM4.7 7.2 12 13l7.3-5.8" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export function AuthDialog({
  initialMode = "login",
  nextPath = "/dashboard",
  onClose,
}: {
  initialMode?: AuthDialogMode;
  nextPath?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AuthDialogMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendRemaining, setResendRemaining] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.focus();
    document.body.classList.add("auth-dialog-open");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("auth-dialog-open");
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, onClose]);

  useEffect(() => {
    if (resendRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setResendRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendRemaining]);

  function setActiveMode(nextMode: AuthDialogMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setVerificationEmail("");
    setShowPassword(false);
  }

  function callbackUrl(destination: string) {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", sanitizeNextPath(destination));
    return url.toString();
  }

  function getClient() {
    const client = getSupabaseBrowserClient();
    if (!client) setError(publicAuthMessages.unavailable);
    return client;
  }

  async function handleGoogle() {
    const client = getClient();
    if (!client) return;

    setBusy(true);
    setError("");
    const result = await startGoogleOAuth(
      client.auth,
      callbackUrl(sanitizeNextPath(nextPath)),
    );
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const client = getClient();
    if (!client) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "login") {
        const emailResult = emailSchema.safeParse(email);
        if (!emailResult.success || !password) {
          setError("Escribe tu correo y contraseña.");
          return;
        }

        const result = await signInWithEmail(client.auth, email, password);
        if (!result.ok) {
          setError(result.message);
          return;
        }

        onClose();
        router.push(sanitizeNextPath(nextPath));
        router.refresh();
        return;
      }

      if (mode === "register") {
        const name = String(form.get("name") ?? "");
        const passwordConfirmation = String(
          form.get("password_confirmation") ?? "",
        );
        const parsed = registrationSchema.safeParse({ email, name, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
          return;
        }
        if (password !== passwordConfirmation) {
          setError("Las contraseñas no coinciden.");
          return;
        }

        const result = await registerWithEmail(client.auth, {
          callbackUrl: callbackUrl("/onboarding"),
          ...parsed.data,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.verificationRequired) {
          setVerificationEmail(parsed.data.email);
          setMessage(result.message);
          setResendRemaining(resendCooldownSeconds);
          return;
        }

        onClose();
        router.push("/onboarding");
        router.refresh();
        return;
      }

      const parsedEmail = emailSchema.safeParse(email);
      if (!parsedEmail.success) {
        setError("Escribe un correo válido.");
        return;
      }
      const result = await requestPasswordRecovery(
        client.auth,
        parsedEmail.data,
        callbackUrl("/auth/reset"),
      );
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (busy || resendRemaining > 0 || !verificationEmail) return;
    const client = getClient();
    if (!client) return;

    setBusy(true);
    setError("");
    try {
      const result = await resendEmailVerification(
        client.auth,
        verificationEmail,
        callbackUrl("/onboarding"),
      );
      setMessage(result.message);
      setResendRemaining(resendCooldownSeconds);
    } finally {
      setBusy(false);
    }
  }

  function stopOverlayKeyboardClose(event: ReactKeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  }

  const title =
    mode === "login"
      ? "Entra en Attruvi"
      : mode === "register"
        ? "Crea tu cuenta"
        : "Recupera tu acceso";

  return createPortal(
    <div
      className="auth-overlay"
      onKeyDown={stopOverlayKeyboardClose}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="auth-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="auth-dialog-accent" aria-hidden="true" />
        <button
          aria-label="Cerrar"
          className="auth-close"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>

        <div className="auth-dialog-brand">
          <Image alt="" height={32} src="/favicon.png" width={32} />
          <span>Attruvi</span>
        </div>

        <div className="auth-dialog-heading">
          <p className="auth-kicker">
            {mode === "login"
              ? "Tu medición, en un solo lugar"
              : mode === "register"
                ? "Empieza sin credenciales publicitarias"
                : "Te enviaremos un enlace seguro"}
          </p>
          <h2 id={titleId}>{title}</h2>
          <p>
            {mode === "login"
              ? "Consulta qué anuncios generan instalaciones, compras e ingresos."
              : mode === "register"
                ? "Solo necesitas tus datos de acceso. Configurarás tu app después."
                : "Escribe tu correo. Por seguridad, verás la misma respuesta exista o no la cuenta."}
          </p>
        </div>

        {verificationEmail ? (
          <div className="auth-completion" role="status">
            <div className="auth-completion-icon"><MailIcon /></div>
            <h3>Revisa tu correo</h3>
            <p>{message}</p>
            <button
              className="auth-primary"
              disabled={busy || resendRemaining > 0}
              onClick={handleResend}
              type="button"
            >
              {resendRemaining > 0
                ? `Reenviar en ${resendRemaining} s`
                : "Reenviar verificación"}
            </button>
            <button
              className="auth-text-button"
              onClick={() => setActiveMode("login")}
              type="button"
            >
              Volver a entrar
            </button>
          </div>
        ) : (
          <>
            {mode !== "forgot" ? (
              <>
                <button
                  className="auth-google"
                  disabled={busy}
                  onClick={handleGoogle}
                  type="button"
                >
                  <GoogleMark /> Continuar con Google
                </button>
                <div className="auth-separator"><span>o con correo</span></div>
              </>
            ) : null}

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === "register" ? (
                <label>
                  <span>Tu nombre</span>
                  <input
                    autoComplete="name"
                    maxLength={120}
                    name="name"
                    placeholder="Por ejemplo, David"
                    required
                  />
                </label>
              ) : null}

              <label>
                <span>Correo</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  name="email"
                  placeholder="tu@correo.com"
                  required
                  type="email"
                />
              </label>

              {mode !== "forgot" ? (
                <label>
                  <span>Contraseña</span>
                  <div className="auth-password-field">
                    <input
                      autoComplete={
                        mode === "register" ? "new-password" : "current-password"
                      }
                      minLength={10}
                      name="password"
                      placeholder="Mínimo 10 caracteres"
                      required
                      type={showPassword ? "text" : "password"}
                    />
                    <button
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </label>
              ) : null}

              {mode === "register" ? (
                <label>
                  <span>Repite la contraseña</span>
                  <input
                    autoComplete="new-password"
                    minLength={10}
                    name="password_confirmation"
                    placeholder="Repite la contraseña"
                    required
                    type={showPassword ? "text" : "password"}
                  />
                </label>
              ) : null}

              {mode === "login" ? (
                <button
                  className="auth-forgot-link"
                  onClick={() => setActiveMode("forgot")}
                  type="button"
                >
                  He olvidado mi contraseña
                </button>
              ) : null}

              {error ? <p className="auth-alert auth-alert-error" role="alert">{error}</p> : null}
              {message ? <p className="auth-alert auth-alert-success" role="status">{message}</p> : null}

              <button className="auth-primary" disabled={busy} type="submit">
                {busy
                  ? "Un momento…"
                  : mode === "login"
                    ? "Entrar"
                    : mode === "register"
                      ? "Crear cuenta"
                      : "Enviar enlace"}
              </button>
            </form>

            <p className="auth-switch">
              {mode === "login"
                ? "¿Aún no tienes cuenta?"
                : mode === "register"
                  ? "¿Ya tienes cuenta?"
                  : "¿Recuerdas tu contraseña?"}
              <button
                onClick={() =>
                  setActiveMode(mode === "login" ? "register" : "login")
                }
                type="button"
              >
                {mode === "login" ? "Crear cuenta" : "Entrar"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
