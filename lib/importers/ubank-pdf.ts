import type { UbankImportReview } from "@/lib/types";

function normalizePdfText(source: string) {
  return source.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n");
}

function amountFromText(value: string | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[+$,\s]/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parsePdfDateRange(text: string) {
  const match = text.match(/(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3})\s+(\d{4})\s*-\s*(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!match) {
    return { start: null, end: null };
  }

  const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = match;
  const start = new Date(`${startMonth} ${startDay} ${startYear}`);
  const end = new Date(`${endMonth} ${endDay} ${endYear}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: null, end: null };
  }

  const toIso = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  return { start: toIso(start), end: toIso(end) };
}

function detectAccountName(text: string) {
  if (/save account statement/i.test(text)) {
    return "Ubank Save Account";
  }
  if (/spend account statement/i.test(text)) {
    return "Ubank Spend Account";
  }
  return "Ubank account";
}

function detectAccountId(text: string, fileName: string) {
  const accountMatch = text.match(/Account Number\s+([\d ]{4,})/i);
  if (accountMatch) {
    const digits = accountMatch[1].replace(/\D/g, "");
    if (digits) {
      return digits.slice(-4);
    }
  }

  const fallback = fileName.match(/-(\d{4})_/);
  return fallback?.[1] ?? null;
}

function countTransactions(text: string) {
  if (/No transactions in this period\./i.test(text)) {
    return 0;
  }

  const matches = text.match(/\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/g);
  return matches ? Math.max(matches.length - 2, 0) : 0;
}

function makeFingerprint(source: string) {
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return `ubank-pdf-${(hash >>> 0).toString(16)}`;
}

export function parseUbankPdfText(source: string, fileName: string): UbankImportReview {
  const text = normalizePdfText(source);
  const accountName = detectAccountName(text);
  const accountId = detectAccountId(text, fileName);
  const { start, end } = parsePdfDateRange(text);
  const closingBalanceMatch = text.match(/Closing balance\s+([+-]?\$[\d,]+\.\d{2})/i);
  const endingBalanceAud = amountFromText(closingBalanceMatch?.[1]);
  const detectedMonth = end ? end.slice(0, 7) : monthValue(new Date());
  const transactionCount = countTransactions(text);

  if (endingBalanceAud === null) {
    throw new Error("We recognised this Ubank PDF, but could not find the closing balance.");
  }

  return {
    fileName,
    accountName,
    accountId,
    statementLabel: start && end ? `${start} to ${end}` : `Month ${detectedMonth}`,
    statementStartDate: start,
    statementEndDate: end,
    detectedMonth,
    endingBalanceAud,
    transactionCount,
    transactions: [],
    statementSignature: [
      accountName.toLowerCase(),
      accountId?.toLowerCase() ?? "",
      start ?? "",
      end ?? "",
      detectedMonth,
      endingBalanceAud.toFixed(2),
      String(transactionCount),
    ].join("|"),
    fileFingerprint: makeFingerprint(text),
  };
}
