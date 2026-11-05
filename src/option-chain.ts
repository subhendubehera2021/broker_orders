import { KotakNeoError } from "./kotak-neo-client.js";

export interface NiftyOptionContract {
  instrumentToken: string;
  tradingSymbol: string;
  optionType: "CE" | "PE";
  strike: number;
  expiry: string;
  lotSize: string;
}

export function selectNearbyNiftyOptionContracts(
  contracts: NiftyOptionContract[],
  spotPrice: number,
  strikesPerSide = 3,
): NiftyOptionContract[] {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
    throw new RangeError("NIFTY spot price must be a positive number");
  }
  if (!Number.isInteger(strikesPerSide) || strikesPerSide < 1) {
    throw new RangeError("Strikes per side must be a positive integer");
  }

  const contractsByStrike = new Map<
    number,
    Partial<Record<NiftyOptionContract["optionType"], NiftyOptionContract>>
  >();
  for (const contract of contracts) {
    const pair = contractsByStrike.get(contract.strike) ?? {};
    pair[contract.optionType] = contract;
    contractsByStrike.set(contract.strike, pair);
  }

  const pairedStrikes = [...contractsByStrike.entries()]
    .filter(([, pair]) => pair.CE && pair.PE)
    .map(([strike]) => strike);
  const below = pairedStrikes
    .filter((strike) => strike < spotPrice)
    .sort((left, right) => right - left)
    .slice(0, strikesPerSide);
  const above = pairedStrikes
    .filter((strike) => strike > spotPrice)
    .sort((left, right) => left - right)
    .slice(0, strikesPerSide);
  const selectedStrikes = new Set([...below, ...above]);

  return contracts.filter(({ strike }) => selectedStrikes.has(strike));
}

const KOTAK_EXPIRY_EPOCH_OFFSET_SECONDS = 315_511_200;

export function parseNiftyOptionContracts(csv: string): NiftyOptionContract[] {
  const [headerRecord, ...dataRecords] = parseCsvRecords(csv);
  if (!headerRecord) {
    throw new KotakNeoError("Kotak Neo returned an empty NSE F&O Scrip Master", 502);
  }

  const headers = headerRecord.map((header) => header.trim());
  const index = (name: string) => headers.indexOf(name);
  const tokenIndex = index("pSymbol");
  const instrumentTypeIndex = index("pInstType");
  const symbolIndex = index("pSymbolName");
  const tradingSymbolIndex = index("pTrdSymbol");
  const optionTypeIndex = index("pOptionType");
  const expiryIndex = index("pExpiryDate");
  const strikeIndex = index("dStrikePrice;");
  const lotSizeIndex = index("lLotSize");

  if (
    [tokenIndex, symbolIndex, optionTypeIndex, expiryIndex, strikeIndex].some((column) => column < 0)
  ) {
    throw new KotakNeoError("NSE F&O Scrip Master has an unexpected CSV format", 502);
  }

  const contracts: NiftyOptionContract[] = [];
  for (const record of dataRecords) {
    if (instrumentTypeIndex >= 0 && record[instrumentTypeIndex]?.trim() !== "OPTIDX") continue;
    if (record[symbolIndex]?.trim().toUpperCase() !== "NIFTY") continue;

    const optionType = record[optionTypeIndex]?.trim().toUpperCase();
    const token = record[tokenIndex]?.trim();
    const strikeUnits = Number(record[strikeIndex]);
    const expiry = expiryLabel(record[expiryIndex] ?? "");
    if (
      (optionType !== "CE" && optionType !== "PE") ||
      !token ||
      !/^\d+$/.test(token) ||
      !Number.isFinite(strikeUnits) ||
      strikeUnits <= 0 ||
      !expiry
    ) {
      continue;
    }

    contracts.push({
      instrumentToken: token,
      tradingSymbol:
        tradingSymbolIndex >= 0 ? (record[tradingSymbolIndex]?.trim() ?? "") : "",
      optionType,
      strike: strikeUnits / 100,
      expiry,
      lotSize: lotSizeIndex >= 0 ? (record[lotSizeIndex]?.trim() ?? "") : "",
    });
  }

  return contracts;
}

export function sortExpiryLabels(expiries: string[]): string[] {
  return expiries.sort((left, right) => expiryTimestamp(left) - expiryTimestamp(right));
}

export function filterUpcomingExpiryLabels(
  expiries: string[],
  now = new Date(),
): string[] {
  const todayParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const today = Number(
    `${todayParts.find(({ type }) => type === "year")?.value}` +
      `${todayParts.find(({ type }) => type === "month")?.value}` +
      `${todayParts.find(({ type }) => type === "day")?.value}`,
  );
  return expiries.filter((expiry) => {
    const key = expiryDateKey(expiry);
    return key !== undefined && key >= today;
  });
}

function expiryTimestamp(value: string): number {
  const key = expiryDateKey(value);
  return key === undefined ? Number.MAX_SAFE_INTEGER : key;
}

function expiryDateKey(value: string): number | undefined {
  const match = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(value);
  if (!match) return undefined;
  const month = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ].indexOf(match[2]);
  if (month < 0) return undefined;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return year * 10_000 + (month + 1) * 100 + day;
}

function expiryLabel(rawValue: string): string | undefined {
  const seconds = Number(rawValue);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const date = new Date((seconds + KOTAK_EXPIRY_EPOCH_OFFSET_SECONDS) * 1000);
  if (!Number.isFinite(date.getTime())) return undefined;

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  return `${day}${month}${date.getUTCFullYear()}`;
}

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new KotakNeoError("Kotak Neo returned an invalid NSE F&O CSV", 502);
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
