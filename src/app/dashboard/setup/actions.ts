"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SdkKeyActionState = {
  appKey?: string;
  message?: string;
  success?: boolean;
};

export type TestEventActionState = {
  message?: string;
  requestId?: string;
  success?: boolean;
};

const keySchema = z.object({
  appId: z.uuid(),
  rotate: z.enum(["0", "1"]),
});

export async function createSdkKeyAction(_state: SdkKeyActionState, formData: FormData): Promise<SdkKeyActionState> {
  await requireVerifiedIdentity();
  const parsed = keySchema.safeParse({
    appId: String(formData.get("app_id") ?? ""),
    rotate: String(formData.get("rotate") ?? "0"),
  });
  if (!parsed.success) return { message: "No se ha podido identificar la app." };

  const appKey = `attruvi_dev_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(appKey).digest("hex");
  const visiblePrefix = appKey.slice(0, 24);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_public_sdk_key", {
    requested_app_id: parsed.data.appId,
    requested_environment: "development",
    requested_key_hash: keyHash,
    requested_visible_prefix: visiblePrefix,
    rotate_existing: parsed.data.rotate === "1",
  });
  if (error) {
    return {
      message: error.code === "23505"
        ? "Ya existe una clave activa. Usa Rotar para revocarla y crear otra."
        : error.code === "42501"
          ? "Necesitas permiso de owner o admin para crear la clave."
          : "No se ha podido crear la clave pública.",
    };
  }
  revalidatePath("/dashboard/setup");
  revalidatePath("/dashboard/settings");
  return {
    appKey,
    message: "Cópiala ahora. Por seguridad, Attruvi no puede volver a mostrar el valor completo.",
    success: true,
  };
}

const testEventSchema = z.object({
  appId: z.uuid(),
  eventName: z.enum(["sign_up", "purchase", "subscription_started"]),
});

export async function sendDevelopmentTestEventAction(
  _state: TestEventActionState,
  formData: FormData,
): Promise<TestEventActionState> {
  await requireVerifiedIdentity();
  const parsed = testEventSchema.safeParse({
    appId: String(formData.get("app_id") ?? ""),
    eventName: String(formData.get("event_name") ?? "sign_up"),
  });
  if (!parsed.success) return { message: "Selecciona un evento de prueba válido." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_development_test_event", {
    requested_app_id: parsed.data.appId,
    requested_event_name: parsed.data.eventName,
  });
  if (error) {
    const message = error.message.includes("development_sdk_key_required")
      ? "Crea primero la clave pública de development."
      : error.message.includes("app_platform_required")
        ? "Añade primero los datos de iOS o Android."
        : error.message.includes("test_rate_limit")
          ? "Has enviado varias pruebas seguidas. Espera un minuto."
          : error.code === "42501"
            ? "Necesitas permiso de owner o admin para enviar la prueba."
            : "No se ha podido recorrer el pipeline de prueba.";
    return { message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard/setup");
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/postbacks");
  return {
    message: "Prueba enviada a development. El Debugger se actualizará automáticamente.",
    requestId: row?.request_id,
    success: true,
  };
}
