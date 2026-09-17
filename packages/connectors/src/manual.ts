import { decimalToMinor, normalizeCurrency } from "./money.js";
import {
  connectorStatus,
  type AdvertisingConnector,
  type ConnectorAccount,
  type ConnectorAuthContext,
  type ConnectorConnectionTest,
  type ConnectorContext,
  type ConnectorPage,
  type ConnectorStatusInput,
  type NormalizedAdCost,
} from "./types.js";

export type ManualCostInput = {
  adExternalId?: string;
  adGroupExternalId?: string;
  adGroupName?: string;
  adName?: string;
  amount: string;
  campaignExternalId?: string;
  campaignName?: string;
  clicks?: string;
  currency: string;
  date: string;
  impressions?: string;
  rowId?: string;
};

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else current += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  values.push(current.trim());
  return values;
}

export function parseManualCostCsv(csv: string): ManualCostInput[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV must contain a header and at least one row.");
  if (lines.length > 1_001) throw new Error("CSV cannot contain more than 1,000 data rows.");
  const delimiter = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = parseCsvLine(lines[0] ?? "", delimiter).map((header) => header.toLowerCase().replaceAll(" ", "_"));
  for (const required of ["date", "amount", "currency"]) {
    if (!headers.includes(required)) throw new Error(`CSV is missing required column: ${required}.`);
  }
  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line, delimiter);
    if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has an invalid number of columns.`);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const date = record.date ?? "";
    const amount = record.amount ?? "";
    const currency = normalizeCurrency(record.currency ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`CSV row ${rowIndex + 2} has an invalid date.`);
    decimalToMinor(amount, currency);
    return {
      ...(record.ad_id ? { adExternalId: record.ad_id } : {}),
      ...(record.ad_group_id ? { adGroupExternalId: record.ad_group_id } : {}),
      ...(record.ad_group_name ? { adGroupName: record.ad_group_name } : {}),
      ...(record.ad_name ? { adName: record.ad_name } : {}),
      amount,
      ...(record.campaign_id ? { campaignExternalId: record.campaign_id } : {}),
      ...(record.campaign_name ? { campaignName: record.campaign_name } : {}),
      ...(record.clicks ? { clicks: record.clicks } : {}),
      currency,
      date,
      ...(record.impressions ? { impressions: record.impressions } : {}),
      rowId: record.row_id || `csv-${rowIndex + 2}`,
    };
  });
  return rows;
}

export function allocateRangeCost(from: string, to: string, amountMinor: bigint): Array<{ amountMinor: bigint; date: string }> {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf()) || end < start) throw new Error("Invalid manual date range.");
  const dates: string[] = [];
  for (let current = start; current <= end; current = new Date(current.valueOf() + 86_400_000)) dates.push(current.toISOString().slice(0, 10));
  const count = BigInt(dates.length);
  const base = amountMinor / count;
  let remainder = amountMinor % count;
  return dates.map((date) => {
    const adjustment = remainder > 0n ? 1n : remainder < 0n ? -1n : 0n;
    remainder -= adjustment;
    return { amountMinor: base + adjustment, date };
  });
}

export class ManualCostConnector implements AdvertisingConnector<ManualCostInput> {
  readonly apiVersion = "manual-v1";
  readonly oauth = null;
  readonly provider = "manual" as const;

  status(input: ConnectorStatusInput) {
    return connectorStatus({ ...input, configured: true });
  }

  async discoverAccounts(_context: ConnectorAuthContext): Promise<ConnectorPage<ConnectorAccount>> {
    void _context;
    return { rows: [{ externalId: "manual", name: "Costes manuales", status: "active" }] };
  }

  async testConnection(_context: ConnectorAuthContext): Promise<ConnectorConnectionTest> {
    void _context;
    return { message: "La entrada manual está disponible.", ok: true };
  }

  async fetchCosts(_context: ConnectorContext): Promise<ConnectorPage<NormalizedAdCost>> {
    void _context;
    return { rows: [] };
  }

  normalize(raw: ManualCostInput, context: Pick<ConnectorContext, "accountExternalId">): NormalizedAdCost {
    const currency = normalizeCurrency(raw.currency);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error("Manual cost date must use YYYY-MM-DD.");
    return {
      accountExternalId: context.accountExternalId,
      ...(raw.adExternalId ? { adExternalId: raw.adExternalId } : {}),
      ...(raw.adGroupExternalId ? { adGroupExternalId: raw.adGroupExternalId } : {}),
      ...(raw.adGroupName ? { adGroupName: raw.adGroupName } : {}),
      ...(raw.adName ? { adName: raw.adName } : {}),
      amountMinor: decimalToMinor(raw.amount, currency),
      ...(raw.campaignExternalId ? { campaignExternalId: raw.campaignExternalId } : {}),
      ...(raw.campaignName ? { campaignName: raw.campaignName } : {}),
      clicks: BigInt(raw.clicks || "0"),
      costDate: raw.date,
      currency,
      entityStatus: "active",
      externalRowId: ["manual", context.accountExternalId, raw.date, raw.rowId ?? raw.campaignExternalId ?? "entry"].join(":"),
      impressions: BigInt(raw.impressions || "0"),
      provider: this.provider,
    };
  }
}
