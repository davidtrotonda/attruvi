const placeholderValues = new Set([
  "https://your-project.supabase.co",
  "sb_publishable_replace_me",
]);

export type SupabasePublicConfig = {
  publishableKey: string;
  url: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (
    !url ||
    !publishableKey ||
    placeholderValues.has(url) ||
    placeholderValues.has(publishableKey)
  ) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "127.0.0.1") {
      return null;
    }
  } catch {
    return null;
  }

  return { publishableKey, url };
}

export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase no está configurado para este entorno.");
  }
  return config;
}
