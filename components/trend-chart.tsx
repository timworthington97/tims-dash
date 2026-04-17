import clsx from "clsx";
import { formatAud } from "@/lib/format";
import type { PortfolioSnapshot, TrendPoint } from "@/lib/types";

export function TrendChart({
  snapshots,
  points,
  compact = false,
  emptyLabel,
}: {
  snapshots?: PortfolioSnapshot[];
  points?: TrendPoint[];
  compact?: boolean;
  emptyLabel?: string;
}) {
  const series =
    points ??
    (snapshots ?? []).map((snapshot) => ({
      label: snapshot.timestamp,
      value: snapshot.totalLiquidValue ?? snapshot.totalCash + snapshot.totalEtfValue + snapshot.totalCryptoValue,
    }));

  if (!series.length) {
    return (
      <div className={clsx("chart-shell", compact && "compact")}>
        <div className="chart-empty">{emptyLabel ?? "Refresh to start a trend line."}</div>
      </div>
    );
  }

  const width = 320;
  const height = compact ? 120 : 170;
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const polylinePoints = series
    .map((point, index) => {
      const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
      const value = point.value;
      const y = height - ((value - min) / range) * (height - 18) - 8;
      return `${x},${y}`;
    })
    .join(" ");

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const direction = last >= first ? "up" : "down";

  return (
    <div className={clsx("chart-shell", compact && "compact")}>
      <svg viewBox={`0 0 ${width} ${height}`} className={clsx("trend-svg", direction)}>
        <defs>
          <linearGradient id={`trend-gradient-${compact ? "compact" : "full"}`} x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(122, 235, 177, 0.35)" />
            <stop offset="100%" stopColor="rgba(122, 235, 177, 0.01)" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          points={polylinePoints}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <polygon
          fill={`url(#trend-gradient-${compact ? "compact" : "full"})`}
          points={`${polylinePoints} ${width},${height} 0,${height}`}
        />
      </svg>
      <div className="chart-caption">
        <span>{formatAud(min)}</span>
        <strong>{formatAud(last)}</strong>
        <span>{formatAud(max)}</span>
      </div>
    </div>
  );
}
