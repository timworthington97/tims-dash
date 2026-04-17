const audCurrency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-AU", {
  style: "percent",
  maximumFractionDigits: 2,
});

export function formatAud(value: number) {
  return audCurrency.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number) {
  return percentFormatter.format(Number.isFinite(value) ? value / 100 : 0);
}

export function formatQuantity(value: number, type: "cash" | "etf" | "crypto" | "debt" | "manualAsset") {
  if (type === "crypto") {
    return value.toLocaleString("en-AU", {
      maximumFractionDigits: 8,
    });
  }

  if (type === "etf") {
    return value.toLocaleString("en-AU", {
      maximumFractionDigits: 4,
    });
  }

  return formatAud(value);
}

export function formatSignedAud(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatAud(Math.abs(value))}`;
}

export function formatMonths(value: number | null) {
  if (value === null) {
    return "Not needed";
  }

  if (value <= 0) {
    return "0 months";
  }

  const rounded = value < 12 ? value.toFixed(1) : value.toFixed(0);
  return `${rounded} months`;
}

export function formatPriceLabel(value: number | null) {
  return value === null ? "Price unavailable" : `${formatAud(value)} unit price`;
}

export function formatSourceLabel(source: string, statusText?: string, detailText?: string) {
  const parts = [statusText, source, detailText].filter(Boolean);
  return parts.join(" • ");
}

export function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function formatRelativeTime(timestamp: string) {
  const deltaMs = new Date(timestamp).getTime() - Date.now();
  const minutes = Math.round(deltaMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }

  const days = Math.round(hours / 24);
  return formatter.format(days, "day");
}
