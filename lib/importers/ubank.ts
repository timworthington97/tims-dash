import type { UbankImportReview, UbankTransactionRow } from "@/lib/types";

type HeaderMap = {
  date: number;
  description: number;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  balance: number | null;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function splitCsvRows(source: string) {
  return source
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findFirstIndex(headers: string[], patterns: string[]) {
  return headers.findIndex((header) => patterns.some((pattern) => header.includes(pattern)));
}

function detectHeaderMap(row: string[]): HeaderMap | null {
  const headers = row.map(normalizeHeader);
  const date = findFirstIndex(headers, ["date", "transaction date", "posted date"]);
  const description = findFirstIndex(headers, ["description", "details", "narration", "transaction description", "merchant"]);
  const debit = findFirstIndex(headers, ["debit", "withdrawal", "money out", "outflow"]);
  const credit = findFirstIndex(headers, ["credit", "deposit", "money in", "inflow"]);
  const amount = findFirstIndex(headers, ["amount", "transaction amount", "value"]);
  const balance = findFirstIndex(headers, ["balance", "running balance", "available balance", "closing balance"]);

  if (date === -1 || description === -1) {
    return null;
  }

  if (debit === -1 && credit === -1 && amount === -1 && balance === -1) {
    return null;
  }

  return {
    date,
    description,
    debit: debit === -1 ? null : debit,
    credit: credit === -1 ? null : credit,
    amount: amount === -1 ? null : amount,
    balance: balance === -1 ? null : balance,
  };
}

function parseAmount(value: string | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/\$/g, "")
    .replace(/aud/gi, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.startsWith("(") && cleaned.endsWith(")") ? `-${cleaned.slice(1, -1)}` : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const expandedYear = year.length === 2 ? `20${year}` : year;
    return `${expandedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function monthValue(date: string) {
  return date.slice(0, 7);
}

function buildStatementLabel(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }
  if (endDate) {
    return `Ending ${endDate}`;
  }
  if (startDate) {
    return `Starting ${startDate}`;
  }
  return "Detected from uploaded CSV";
}

function buildDetectedMonthLabel(month: string | null) {
  if (!month) {
    return "Detected from uploaded CSV";
  }

  return `Month ${month}`;
}

function deriveAccountFromFileName(fileName: string) {
  const clean = fileName.replace(/\.csv$/i, "");
  const monthMatch = clean.match(/(\d{4}-\d{2})$/);
  const nameWithoutMonth = monthMatch ? clean.slice(0, monthMatch.index).replace(/[_-]+$/, "") : clean;
  const parts = nameWithoutMonth.split(/[_-]+/).filter(Boolean);
  const accountId = parts.find((part) => /^\d{3,}$/.test(part)) ?? null;
  const accountName = parts.filter((part) => part !== accountId).join(" ").trim() || clean;

  return {
    accountName,
    accountId,
    detectedMonth: monthMatch?.[1] ?? null,
  };
}

function makeFingerprint(source: string) {
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return `ubank-${(hash >>> 0).toString(16)}`;
}

function detectMetadata(rows: string[][]) {
  const metadata = new Map<string, string>();

  for (const row of rows) {
    if (row.length < 2) {
      continue;
    }

    const key = normalizeHeader(row[0]);
    const value = row[1]?.trim();
    if (!key || !value) {
      continue;
    }

    metadata.set(key, value);
  }

  return metadata;
}

function uniqueTransactions(rows: UbankTransactionRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.date}|${row.description}|${row.amountAud ?? ""}|${row.balanceAud ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function parseUbankCsv(source: string, fileName = "Ubank CSV"): UbankImportReview {
  const rows = splitCsvRows(source);
  if (!rows.length) {
    throw new Error("This CSV file is empty.");
  }

  const headerRowIndex = rows.findIndex((row) => detectHeaderMap(row) !== null);
  if (headerRowIndex === -1) {
    throw new Error("We could not recognise this as a Ubank-style CSV. Export a CSV statement from Ubank and try again.");
  }

  const headerMap = detectHeaderMap(rows[headerRowIndex]);
  if (!headerMap) {
    throw new Error("We could not read the statement columns in this CSV.");
  }

  const metadata = detectMetadata(rows.slice(0, headerRowIndex));
  const fallbackAccount = deriveAccountFromFileName(fileName);
  const transactionRows = rows.slice(headerRowIndex + 1);
  const transactions = uniqueTransactions(
    transactionRows
      .map<UbankTransactionRow | null>((row) => {
        const date = parseDate(row[headerMap.date]);
        const description = row[headerMap.description]?.trim() ?? "";
        const debitAud = headerMap.debit === null ? null : parseAmount(row[headerMap.debit]);
        const creditAud = headerMap.credit === null ? null : parseAmount(row[headerMap.credit]);
        const signedAmount = headerMap.amount === null ? null : parseAmount(row[headerMap.amount]);
        const balanceAud = headerMap.balance === null ? null : parseAmount(row[headerMap.balance]);
        const hasUsableData = Boolean(description || debitAud !== null || creditAud !== null || signedAmount !== null || balanceAud !== null);

        if (!date || !hasUsableData) {
          return null;
        }
        const amountAud =
          signedAmount ??
          (debitAud !== null || creditAud !== null ? (creditAud ?? 0) - (debitAud ?? 0) : null);

        return {
          date,
          description,
          debitAud,
          creditAud,
          amountAud,
          balanceAud,
        };
      })
      .filter((row): row is UbankTransactionRow => row !== null),
  );
  const sortedDates = transactions.map((transaction) => transaction.date).sort();
  const statementStartDate = metadata.get("from")
    ? parseDate(metadata.get("from"))
    : metadata.get("statement start")
      ? parseDate(metadata.get("statement start"))
      : sortedDates[0] ?? null;
  const statementEndDate = metadata.get("to")
    ? parseDate(metadata.get("to"))
    : metadata.get("statement end")
      ? parseDate(metadata.get("statement end"))
      : sortedDates[sortedDates.length - 1] ?? null;

  const endingBalanceAud =
    parseAmount(metadata.get("ending balance")) ??
    parseAmount(metadata.get("closing balance")) ??
    [...transactions].reverse().find((transaction) => transaction.balanceAud !== null)?.balanceAud ??
    null;

  const detectedMonth =
    statementEndDate
      ? monthValue(statementEndDate)
      : fallbackAccount.detectedMonth ?? monthValue(sortedDates[sortedDates.length - 1] ?? new Date().toISOString().slice(0, 10));

  if (!transactions.length && endingBalanceAud === null) {
    return {
      fileName,
      accountName: fallbackAccount.accountName,
      accountId: fallbackAccount.accountId,
      statementLabel: buildDetectedMonthLabel(detectedMonth),
      statementStartDate,
      statementEndDate,
      detectedMonth,
      endingBalanceAud: null,
      transactionCount: 0,
      transactions: [],
      statementSignature: [
        fallbackAccount.accountName.toLowerCase().trim(),
        fallbackAccount.accountId?.toLowerCase().trim() ?? "",
        detectedMonth,
        "manual-balance",
      ].join("|"),
      fileFingerprint: makeFingerprint(source),
      manualBalanceRequired: true,
    };
  }

  if (endingBalanceAud === null) {
    throw new Error("We could not find an ending balance in this CSV. Make sure the exported statement includes a balance column.");
  }

  const accountName =
    metadata.get("account name") ??
    metadata.get("account") ??
    metadata.get("account nickname") ??
    metadata.get("statement name") ??
    fallbackAccount.accountName;
  const accountId =
    metadata.get("account id") ??
    metadata.get("account number") ??
    metadata.get("account identifier") ??
    fallbackAccount.accountId;
  const statementSignature = [
    accountName?.toLowerCase().trim() ?? "",
    accountId?.toLowerCase().trim() ?? "",
    statementStartDate ?? "",
    statementEndDate ?? "",
    detectedMonth,
    endingBalanceAud.toFixed(2),
    String(transactions.length),
  ].join("|");

  return {
    fileName,
    accountName,
    accountId,
    statementLabel: buildStatementLabel(statementStartDate, statementEndDate),
    statementStartDate,
    statementEndDate,
    detectedMonth,
    endingBalanceAud,
    transactionCount: transactions.length,
    transactions,
    statementSignature,
    fileFingerprint: makeFingerprint(source),
  };
}
