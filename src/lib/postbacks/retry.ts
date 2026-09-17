export function postbackRetryDelaySeconds(attempt: number, retryAfterSeconds?: number, random = Math.random) {
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.min(Math.ceil(retryAfterSeconds), 21_600);
  const ceiling = Math.min(30 * 2 ** Math.max(0, attempt - 1), 21_600);
  return Math.max(15, Math.ceil(ceiling / 2 + random() * ceiling / 2));
}
