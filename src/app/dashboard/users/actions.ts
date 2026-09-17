"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const eraseSchema = z.object({ appId: z.uuid(), appUserId: z.uuid(), confirmation: z.literal("erase") });

export async function eraseAppUserAction(formData: FormData) {
  await requireVerifiedIdentity();
  const parsed = eraseSchema.safeParse({
    appId: String(formData.get("app_id") ?? ""),
    appUserId: String(formData.get("app_user_id") ?? ""),
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!parsed.success) redirect("/dashboard/users?privacy_error=confirmation");
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("erase_app_user", {
    requested_app_id: parsed.data.appId,
    requested_app_user_id: parsed.data.appUserId,
  });
  if (error) redirect("/dashboard/users?privacy_error=permission");
  revalidatePath("/dashboard/users");
  redirect("/dashboard/users?privacy_saved=erased");
}
