export function supabaseServerAuthHeaders(apiKeyInput: string): Readonly<Record<string, string>> {
  const apiKey = apiKeyInput.trim();
  if (!apiKey) throw new Error("supabase_server_api_key_missing");
  return {
    apikey: apiKey,
    // Opaque sb_secret keys are API keys, not JWT bearer tokens. Legacy
    // service_role keys still need Authorization for PostgREST role selection.
    ...(apiKey.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${apiKey}` }),
  };
}
