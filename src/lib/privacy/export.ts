const sensitiveFieldsByTable: Readonly<Record<string, readonly string[]>> = {
  app_users: ["canonical_user_hash"],
  connector_accounts: ["secret_reference"],
  identities: ["identity_hash"],
  installations: ["installation_access_token_hash", "installation_key_hash"],
  postback_destinations: ["test_event_code"],
  public_sdk_keys: ["key_hash"],
};

export function sanitizePrivacyExportRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const sensitiveFields = sensitiveFieldsByTable[table];
  if (!sensitiveFields?.length) return row;

  const sanitized = { ...row };
  for (const field of sensitiveFields) delete sanitized[field];
  return sanitized;
}
