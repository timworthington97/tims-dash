import clsx from "clsx";
import { formatAud, formatSignedAud } from "@/lib/format";
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
  const series: TrendPoint[] =
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
  const height = compact ? 94 : 132;
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const direction = last >= first ? "up" : "down";
  const firstLabel = series[0]?.dateLabel ?? series[0]?.label ?? "Start";
  const lastLabel = series[series.length - 1]?.dateLabel ?? series[series.length - 1]?.label ?? "Latest";

  const pathPoints = series
    .map((point, index) => {
      const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
      const value = point.value;
      const y = height - ((value - min) / range) * (height - 28) - 10;
      return { x, y };
    });
  const polylinePoints = pathPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const endPoint = pathPoints[pathPoints.length - 1] ?? { x: width / 2, y: height / 2 };
  const startPoint = pathPoints[0] ?? { x: width / 2, y: height / 2 };

  return (
    <div className={clsx("chart-shell", compact && "compact")}>
      <svg viewBox={`0 0 ${width} ${height}`} className={clsx("trend-svg", direction)}>
        <defs>
          <linearGradient id={`trend-gradient-${compact ? "compact" : "full"}`} x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(143, 229, 192, 0.24)" />
            <stop offset="100%" stopColor="rgba(143, 229, 192, 0.01)" />
          </linearGradient>
        </defs>
        {[0.2, 0.5, 0.8].map((offset) => (
          <line
            key={offset}
            x1="0"
            x2={width}
            y1={height * offset}
            y2={height * offset}
            className="trend-grid-line"
          />
        ))}
        <polyline
          fill="none"
          points={polylinePoints}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={compact ? "2.5" : "2.75"}
        />
        <polygon
          fill={`url(#trend-gradient-${compact ? "compact" : "full"})`}
          points={`${polylinePoints} ${width},${height} 0,${height}`}
        />
        <circle cx={startPoint.x} cy={startPoint.y} r="2.5" className="trend-point start" />
        <circle cx={endPoint.x} cy={endPoint.y} r="4" className="trend-point end" />
      </svg>
      <div className="chart-caption">
        <span>
          {compact ? "Start" : firstLabel}
          <strong>{formatAud(first)}</strong>
        </span>
        <span className="chart-caption-current">
          Current
          <strong>{formatAud(last)}</strong>
        </span>
        <span className={clsx("chart-caption-delta", direction === "up" ? "positive-text" : "negative-text")}>
          {compact ? "Change" : lastLabel}
          <strong>{formatSignedAud(last - first)}</strong>
        </span>
      </div>
    </div>
  );
}
