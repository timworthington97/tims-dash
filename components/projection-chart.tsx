import clsx from "clsx";
import { formatAud, formatSignedAud } from "@/lib/format";
import type { ProjectionPoint } from "@/lib/types";

export function ProjectionChart({
  points,
  startingBalance,
}: {
  points: ProjectionPoint[];
  startingBalance: number;
}) {
  if (!points.length) {
    return null;
  }

  const values = [startingBalance, ...points.map((point) => point.balance)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const finalBalance = points.at(-1)?.balance ?? startingBalance;

  return (
    <div className="projection-chart-card inset-surface">
      <div className="projection-chart-head">
        <div>
          <p className="eyebrow">Forecast View</p>
          <h3>12-month path</h3>
        </div>
        <span className="subtle">Month-end balances</span>
      </div>

      <div className="projection-chart-bars" aria-label="Projected month-end balances for the next 12 months">
        {points.map((point, index) => {
          const previousBalance = index === 0 ? startingBalance : points[index - 1]?.balance ?? startingBalance;
          const height = 18 + ((point.balance - min) / range) * 86;

          return (
            <div key={point.label} className="projection-bar-group">
              <div
                className={clsx("projection-bar", point.balance >= previousBalance ? "up" : "down")}
                style={{ height: `${height}px` }}
                title={`${point.label}: ${formatAud(point.balance)} (${formatSignedAud(point.delta)})`}
              />
              <span>{point.label.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>

      <div className="projection-chart-caption">
        <span>Now {formatAud(startingBalance)}</span>
        <strong>{formatAud(finalBalance)}</strong>
        <span>{formatSignedAud(finalBalance - startingBalance)} over 12 months</span>
      </div>
    </div>
  );
}
