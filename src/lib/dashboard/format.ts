export function formatMoneyMinor(value: bigint | number | string, currency: string) {
  return new Intl.NumberFormat("es-ES", {
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value) / 100);
}

export function formatDecimalMoney(value: number | string | null, currency: string) {
  return value === null ? "—" : formatMoneyMinor(value, currency);
}

export function formatRatio(value: number | string | null) {
  if (value === null) return "—";
  return `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 })}×`;
}

export function formatPercent(value: number | string | null) {
  if (value === null) return "—";
  return `${(Number(value) * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
}

export function formatDateTime(value: string | null, timezone = "Europe/Madrid") {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function shortOpaqueId(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function periodChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}
