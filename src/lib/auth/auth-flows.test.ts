import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  publicAuthMessages,
  registerWithEmail,
  requestPasswordRecovery,
  signInWithEmail,
  startGoogleOAuth,
} from "./flows";
import { sanitizeNextPath, isPrivateApi, isProtectedPage } from "./navigation";
import { exchangePkceCode, verifyEmailOtp } from "./server-flows";

type AuthClient = SupabaseClient["auth"];

function authClientWith(methods: Record<string, unknown>) {
  return methods as unknown as AuthClient;
}

describe("flujos de autenticación", () => {
  it("registra con nombre y pide verificación cuando no hay sesión", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: null, user: { id: "user-1" } },
      error: null,
    });
    const auth = authClientWith({ signUp });

    const result = await registerWithEmail(auth, {
      callbackUrl: "https://www.attruvi.com/auth/callback?next=%2Fonboarding",
      email: "persona@example.com",
      name: "Persona Demo",
      password: "Password123",
    });

    expect(result).toMatchObject({ ok: true, verificationRequired: true });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "persona@example.com",
        options: expect.objectContaining({
          data: { full_name: "Persona Demo" },
        }),
      }),
    );
  });

  it("verifica un token de correo con el tipo permitido", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    const auth = authClientWith({ verifyOtp });

    await expect(verifyEmailOtp(auth, "hash-ficticio", "signup")).resolves.toEqual({
      ok: true,
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-ficticio",
      type: "signup",
    });
  });

  it("no filtra el error interno cuando la contraseña es incorrecta", async () => {
    const auth = authClientWith({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials for existing account" },
      }),
    });

    const result = await signInWithEmail(
      auth,
      "persona@example.com",
      "incorrecta",
    );

    expect(result).toEqual({
      message: publicAuthMessages.invalidCredentials,
      ok: false,
    });
    expect(result.message).not.toContain("existing account");
  });

  it("la recuperación responde igual aunque Supabase no encuentre la cuenta", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({
      data: {},
      error: null,
    });
    const auth = authClientWith({ resetPasswordForEmail });

    const result = await requestPasswordRecovery(
      auth,
      "desconocido@example.com",
      "https://www.attruvi.com/auth/callback?next=%2Fauth%2Freset",
    );

    expect(result.message).toBe(publicAuthMessages.recoveryRequested);
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
  });

  it("simula Google OAuth con PKCE y retorno al callback", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
    const auth = authClientWith({ signInWithOAuth });
    const redirectTo = "https://www.attruvi.com/auth/callback?next=%2Fdashboard";

    await expect(startGoogleOAuth(auth, redirectTo)).resolves.toEqual({
      message: "Abriendo Google…",
      ok: true,
    });
    expect(signInWithOAuth).toHaveBeenCalledWith({
      options: {
        queryParams: { prompt: "select_account" },
        redirectTo,
      },
      provider: "google",
    });
  });

  it("intercambia el código PKCE antes de crear la sesión SSR", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: {},
      error: null,
    });
    const auth = authClientWith({ exchangeCodeForSession });

    await expect(exchangePkceCode(auth, "codigo-ficticio")).resolves.toEqual({
      ok: true,
    });
    expect(exchangeCodeForSession).toHaveBeenCalledWith("codigo-ficticio");
  });
});

describe("seguridad de rutas", () => {
  it("acepta retornos internos y bloquea redirecciones abiertas", () => {
    expect(sanitizeNextPath("/dashboard?app=demo")).toBe("/dashboard?app=demo");
    expect(sanitizeNextPath("https://evil.example/steal")).toBe("/dashboard");
    expect(sanitizeNextPath("//evil.example/steal")).toBe("/dashboard");
    expect(sanitizeNextPath("/\\evil.example/steal")).toBe("/dashboard");
  });

  it("protege el panel, onboarding y APIs privadas sin cerrar la landing", () => {
    expect(isProtectedPage("/dashboard")).toBe(true);
    expect(isProtectedPage("/onboarding/step-2")).toBe(true);
    expect(isProtectedPage("/auth/reset")).toBe(true);
    expect(isPrivateApi("/api/private/session")).toBe(true);
    expect(isProtectedPage("/")).toBe(false);
    expect(isPrivateApi("/api/public/links/demo")).toBe(false);
  });
});
