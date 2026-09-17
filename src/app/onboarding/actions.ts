"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensurePersonalWorkspace, requireVerifiedIdentity } from "@/lib/auth/session";
import { onboardingSchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OnboardingActionState = {
  errors?: Record<string, string[]>;
  message?: string;
};

export async function submitOnboarding(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const identity = await requireVerifiedIdentity();
  const supabase = await createSupabaseServerClient();
  await ensurePersonalWorkspace(supabase, identity.displayName);

  const input = {
    androidPackageName: String(formData.get("android_package_name") ?? ""),
    appName: String(formData.get("app_name") ?? ""),
    currency: String(formData.get("currency") ?? "EUR"),
    iosBundleId: String(formData.get("ios_bundle_id") ?? ""),
    platform: String(formData.get("platform") ?? "both"),
    projectName: String(formData.get("project_name") ?? ""),
    timezone: String(formData.get("timezone") ?? "Europe/Madrid"),
  };
  const intent = formData.get("intent") === "save" ? "save" : "complete";

  if (intent === "save") {
    const draft = {
      android_package_name: input.androidPackageName.trim().slice(0, 255),
      app_name: input.appName.trim().slice(0, 120),
      currency: input.currency.trim().toUpperCase(),
      ios_bundle_id: input.iosBundleId.trim().slice(0, 255),
      platform: ["ios", "android", "both"].includes(input.platform)
        ? input.platform
        : "both",
      project_name: input.projectName.trim().slice(0, 120),
      timezone: input.timezone.trim().slice(0, 120),
    };
    const { error } = await supabase.rpc("save_personal_onboarding_draft", {
      draft,
    });

    if (error) {
      return { message: "No se ha podido guardar. Vuelve a intentarlo." };
    }

    redirect("/?onboarding=saved");
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: "Revisa los campos marcados.",
    };
  }

  const { error } = await supabase.rpc("complete_personal_onboarding", {
    requested_android_package_name: parsed.data.androidPackageName,
    requested_app_name: parsed.data.appName,
    requested_currency: parsed.data.currency,
    requested_ios_bundle_id: parsed.data.iosBundleId,
    requested_platform: parsed.data.platform,
    requested_project_name: parsed.data.projectName,
    requested_timezone: parsed.data.timezone,
  });

  if (error) {
    console.error("[onboarding.complete] Supabase RPC failed", {
      code: error.code,
    });

    return {
      message:
        "No hemos podido guardar la configuración por un error temporal. Inténtalo de nuevo.",
    };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
