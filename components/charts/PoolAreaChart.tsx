"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { ChartDataPoint } from "@/hooks/usePoolSnapshots";

interface PoolAreaChartProps {
  data: ChartDataPoint[];
  dataKey: "totalDeposits" | "totalBorrows" | "totalCollateral" | "supplyApy" | "borrowRate";
  gradientId: string;
  formatValue: (v: number) => string;
  yAxisFormatter?: (v: number) => string;
  showAverage?: boolean;
}

function CustomTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg">
      <div className="text-xs text-[var(--text-tertiary)] mb-1">{label}</div>
      <div className="text-sm font-semibold text-[var(--text-primary)]">
        {formatValue(payload[0].value)}
      </div>
    </div>
  );
}

export default function PoolAreaChart({
  data: rawData,
  dataKey,
  gradientId,
  formatValue,
  yAxisFormatter,
  showAverage,
}: PoolAreaChartProps) {
  // Pad single data point so Recharts can draw a line instead of just a dot
  const data = useMemo(() => {
    if (rawData.length !== 1) return rawData;
    const point = rawData[0];
    const dayBefore = point.timestamp - 86400;
    const d = new Date(dayBefore * 1000);
    return [
      {
        ...point,
        timestamp: dayBefore,
        date: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        totalDeposits: 0,
        totalBorrows: 0,
        totalCollateral: 0,
        supplyApy: 0,
        borrowRate: 0,
      },
      point,
    ];
  }, [rawData]);

  const average = useMemo(() => {
    if (!showAverage || data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d[dataKey], 0) / data.length;
  }, [data, dataKey, showAverage]);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(1, 107, 229)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="rgb(1, 107, 229)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255, 255, 255, 0.06)"
          vertical={false}
        />

        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "rgb(100, 100, 110)", fontSize: 11 }}
          dy={8}
          interval="preserveStartEnd"
          minTickGap={40}
        />

        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "rgb(100, 100, 110)", fontSize: 11 }}
          tickFormatter={yAxisFormatter}
          width={55}
        />

        <Tooltip
          content={<CustomTooltip formatValue={formatValue} />}
          cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
        />

        <Area
          type="monotone"
          dataKey={dataKey}
          stroke="rgb(1, 107, 229)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: "rgb(1, 107, 229)",
            stroke: "#fff",
            strokeWidth: 2,
          }}
        />

        {showAverage && average > 0 && (
          <ReferenceLine
            y={average}
            stroke="rgb(176, 176, 176)"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `Avg ${formatValue(average)}`,
              position: "left",
              fill: "rgb(176, 176, 176)",
              fontSize: 10,
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
