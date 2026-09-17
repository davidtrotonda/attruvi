export function supabaseServerAuthHeaders(apiKeyInput: string): Readonly<Record<string, string>> {
  const apiKey = apiKeyInput.trim();
  if (!apiKey) throw new Error("supabase_server_api_key_missing");
  return {
    apikey: apiKey,
    ...(apiKey.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${apiKey}` }),
  };
}
