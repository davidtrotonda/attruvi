type Environment = Record<string, string | undefined>;

export type EnvironmentValidation = {
  mode: "landing" | "platform";
  warnings: string[];
};

const serverOnlyName = /(?:SECRET|SERVICE_ROLE|PRIVATE|ENCRYPTION|CRON|DEVELOPER_TOKEN|SYNC_TOKEN)/i;

function configured(env: Environment, name: string) {
  return Boolean(env[name]?.trim());
}

function validateUrl(env: Environment, name: string, issues: string[]) {
  const value = env[name]?.trim();
  if (!value) return;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !local) issues.push(`${name} debe usar HTTPS.`);
  } catch {
    issues.push(`${name} no es una URL válida.`);
  }
}

function validateGroup(env: Environment, names: string[], issues: string[]) {
  const present = names.filter((name) => configured(env, name));
  if (present.length > 0 && present.length !== names.length) {
    issues.push(`Configura juntas estas variables: ${names.join(", ")}.`);
  }
}

function validateEncryptionKeyring(env: Environment, issues: string[], warnings: string[]) {
  const encoded = env.CONNECTOR_ENCRYPTION_KEYS?.trim();
  const active = env.CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION?.trim();
  const legacy = env.CONNECTOR_ENCRYPTION_KEY?.trim();
  if (!encoded && !legacy) return;
  if (legacy && !encoded) {
    try {
      if (Buffer.from(legacy, "base64").length !== 32) throw new Error();
      warnings.push("CONNECTOR_ENCRYPTION_KEY usa el formato heredado; migra al llavero versionado.");
    } catch {
      issues.push("CONNECTOR_ENCRYPTION_KEY debe contener exactamente 32 bytes en base64.");
    }
    return;
  }
  if (!active) issues.push("CONNECTOR_ENCRYPTION_ACTIVE_KEY_VERSION es obligatoria con CONNECTOR_ENCRYPTION_KEYS.");
  try {
    const parsed = JSON.parse(encoded ?? "") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) throw new Error();
    for (const [version, value] of entries) {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(version) || typeof value !== "string" || Buffer.from(value, "base64").length !== 32) {
        throw new Error();
      }
    }
    if (active && !(active in parsed)) issues.push("La versión activa no existe en CONNECTOR_ENCRYPTION_KEYS.");
  } catch {
    issues.push("CONNECTOR_ENCRYPTION_KEYS debe ser un objeto JSON de claves base64 de 32 bytes.");
  }
}

export function validateServerEnvironment(env: Environment = process.env): EnvironmentValidation {
  const issues: string[] = [];
  const warnings: string[] = [];
  const publicUrl = configured(env, "NEXT_PUBLIC_SUPABASE_URL");
  const publicKey = configured(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const platformMode = publicUrl || publicKey || env.ATTRUVI_REQUIRE_PLATFORM_ENV === "true";

  for (const [name, value] of Object.entries(env)) {
    if (value?.trim() && name.startsWith("NEXT_PUBLIC_") && serverOnlyName.test(name)) {
      issues.push(`${name} parece un secreto y no puede exponerse al navegador.`);
    }
  }

  if (publicUrl !== publicKey) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY deben configurarse juntas.");
  }
  if (env.ATTRUVI_REQUIRE_PLATFORM_ENV === "true") {
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "CRON_SECRET"]) {
      if (!configured(env, name)) issues.push(`${name} es obligatoria en modo plataforma estricto.`);
    }
    if (!configured(env, "SUPABASE_SECRET_KEY") && !configured(env, "SUPABASE_SERVICE_ROLE_KEY")) {
      issues.push("SUPABASE_SECRET_KEY es obligatoria en modo plataforma estricto.");
    }
  }

  if (configured(env, "SUPABASE_SERVICE_ROLE_KEY") && !configured(env, "SUPABASE_SECRET_KEY")) {
    warnings.push("SUPABASE_SERVICE_ROLE_KEY es heredada; prioriza SUPABASE_SECRET_KEY.");
  }
  validateUrl(env, "NEXT_PUBLIC_SUPABASE_URL", issues);
  validateUrl(env, "NEXT_PUBLIC_SITE_URL", issues);
  validateUrl(env, "ATTRUVI_LINKS_BASE_URL", issues);
  validateUrl(env, "ATTRUVI_INGEST_BASE_URL", issues);
  validateUrl(env, "ATTRUVI_LINKS_WORKER_URL", issues);
  validateGroup(env, ["ATTRUVI_LINKS_WORKER_URL", "ATTRUVI_LINKS_SYNC_TOKEN"], issues);
  validateGroup(env, ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"], issues);
  validateGroup(env, ["META_ADS_APP_ID", "META_ADS_APP_SECRET"], issues);
  validateGroup(env, ["TIKTOK_ADS_APP_ID", "TIKTOK_ADS_APP_SECRET"], issues);
  validateEncryptionKeyring(env, issues, warnings);

  if (issues.length > 0) {
    throw new Error(`Configuración de entorno insegura o incompleta:\n- ${issues.join("\n- ")}`);
  }
  return { mode: platformMode ? "platform" : "landing", warnings };
}
