"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  format,
  duration = 550,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const start = previous.current;
    const delta = value - start;
    const startedAt = performance.now();

    let frame = 0;

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(start + delta * eased);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previous.current = value;
      }
    };

    if (delta !== 0) {
      frame = window.requestAnimationFrame(tick);
    } else {
      previous.current = value;
    }

    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);

  return <>{format(displayValue)}</>;
}
