"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { managedAppSchema } from "@/lib/smart-links/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppActionState = {
  errors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
};

export async function saveAppAction(
  _previousState: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  await requireVerifiedIdentity();
  const parsed = managedAppSchema.safeParse({
    androidPackageName: String(formData.get("android_package_name") ?? ""),
    appId: String(formData.get("app_id") ?? ""),
    currency: String(formData.get("currency") ?? "EUR"),
    iosBundleId: String(formData.get("ios_bundle_id") ?? ""),
    name: String(formData.get("name") ?? ""),
    platform: String(formData.get("platform") ?? "both"),
    sessionTimeoutMinutes: String(formData.get("session_timeout_minutes") ?? "30"),
    status: String(formData.get("status") ?? "active"),
    timezone: String(formData.get("timezone") ?? "Europe/Madrid"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revisa los campos marcados." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_personal_app", {
    payload: {
      android_package_name: parsed.data.androidPackageName || null,
      app_id: parsed.data.appId || null,
      currency: parsed.data.currency,
      ios_bundle_id: parsed.data.iosBundleId || null,
      name: parsed.data.name,
      platform: parsed.data.platform,
      status: parsed.data.status,
      timezone: parsed.data.timezone,
    },
  });

  if (error) {
    return {
      message: error.code === "23505"
        ? "Ese identificador ya está usado por otra app de tu proyecto."
        : "No se ha podido guardar la app. Inténtalo de nuevo.",
    };
  }

  const savedAppId = parsed.data.appId || data?.[0]?.app_id;
  if (!savedAppId) return { message: "La app se guardó, pero no se pudo configurar su sesión." };
  const { error: timeoutError } = await supabase.rpc("set_app_session_timeout", {
    requested_app_id: savedAppId,
    requested_timeout_minutes: parsed.data.sessionTimeoutMinutes,
  });
  if (timeoutError) return { message: "La app se guardó, pero no se pudo configurar su sesión." };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/apps");
  revalidatePath("/dashboard/links");
  redirect(`/dashboard/apps?saved=${parsed.data.appId ? "updated" : "created"}`);
}
