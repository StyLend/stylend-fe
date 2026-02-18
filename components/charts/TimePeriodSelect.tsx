"use client";

import { useRef, useEffect, useCallback } from "react";
import { gsap } from "@/hooks/useGsap";
import type { ChartDataPoint } from "@/hooks/usePoolSnapshots";

export type TimePeriod = "1W" | "1M" | "3M" | "ALL";

const OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "ALL", label: "All" },
];

export function filterByTimePeriod(
  data: ChartDataPoint[],
  period: TimePeriod,
): ChartDataPoint[] {
  if (period === "ALL" || data.length === 0) return data;

  const now = Date.now() / 1000;
  const cutoff: Record<Exclude<TimePeriod, "ALL">, number> = {
    "1W": now - 7 * 86400,
    "1M": now - 30 * 86400,
    "3M": now - 90 * 86400,
  };

  return data.filter((d) => d.timestamp >= cutoff[period]);
}

export default function TimePeriodSelect({
  value,
  onChange,
}: {
  value: TimePeriod;
  onChange: (p: TimePeriod) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<Map<TimePeriod, HTMLButtonElement>>(new Map());

  const moveIndicator = useCallback((period: TimePeriod, animate: boolean) => {
    const btn = buttonsRef.current.get(period);
    const indicator = indicatorRef.current;
    const container = containerRef.current;
    if (!btn || !indicator || !container) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const props = {
      x: btnRect.left - containerRect.left,
      width: btnRect.width,
    };

    if (animate) {
      gsap.to(indicator, { ...props, duration: 0.35, ease: "power3.out" });
    } else {
      gsap.set(indicator, props);
    }
  }, []);

  // Position indicator on mount
  useEffect(() => {
    moveIndicator(value, false);
  }, [value, moveIndicator]);

  const handleClick = (period: TimePeriod) => {
    if (period === value) return;
    moveIndicator(period, true);
    onChange(period);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5"
    >
      {/* Animated indicator */}
      <div
        ref={indicatorRef}
        className="absolute top-0.5 left-0 h-[calc(100%-4px)] rounded-md bg-white/[0.1]"
        style={{ width: 0 }}
      />

      {OPTIONS.map((o) => (
        <button
          key={o.value}
          ref={(el) => { if (el) buttonsRef.current.set(o.value, el); }}
          onClick={() => handleClick(o.value)}
          className={`relative z-10 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
            value === o.value
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
