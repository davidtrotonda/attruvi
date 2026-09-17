const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("currency must be an ISO 4217 code");
  return normalized;
}

export function currencyExponent(currency: string): number {
  const code = normalizeCurrency(currency);
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function decimalToMinor(value: string, currency: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) throw new Error("amount must be a decimal number");
  const exponent = currencyExponent(currency);
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(exponent + 1)}`;
  const retained = padded.slice(0, exponent) || "0";
  const roundDigit = Number(padded[exponent] ?? "0");
  let result = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(retained);
  if (roundDigit >= 5) result += 1n;
  return negative ? -result : result;
}

export function microsToMinor(value: string | number, currency: string): bigint {
  const micros = BigInt(value);
  const exponent = currencyExponent(currency);
  const divisor = 10n ** BigInt(6 - exponent);
  const quotient = micros / divisor;
  const remainder = micros % divisor;
  return quotient + (remainder * 2n >= divisor ? 1n : 0n);
}
