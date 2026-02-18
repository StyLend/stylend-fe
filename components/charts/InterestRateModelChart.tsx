"use client";

import { useMemo, useCallback } from "react";
import { useReadContracts } from "wagmi";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { CHAIN } from "@/lib/contracts";

interface Props {
  irmAddress: `0x${string}`;
  routerAddress: `0x${string}`;
  currentUtilization: number; // 0-100
}

interface RatePoint {
  utilization: number;
  borrowRate: number;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded bg-[var(--bg-tertiary)] animate-pulse ${className ?? ""}`} />;
}

export default function InterestRateModelChart({
  irmAddress,
  routerAddress,
  currentUtilization,
}: Props) {
  const { data: irmParams, isLoading } = useReadContracts({
    contracts: [
      { address: irmAddress, abi: interestRateModelAbi, functionName: "lendingPoolBaseRate", args: [routerAddress], chainId: CHAIN.id },
      { address: irmAddress, abi: interestRateModelAbi, functionName: "lendingPoolRateAtOptimal", args: [routerAddress], chainId: CHAIN.id },
      { address: irmAddress, abi: interestRateModelAbi, functionName: "lendingPoolOptimalUtilization", args: [routerAddress], chainId: CHAIN.id },
      { address: irmAddress, abi: interestRateModelAbi, functionName: "lendingPoolMaxUtilization", args: [routerAddress], chainId: CHAIN.id },
      { address: irmAddress, abi: interestRateModelAbi, functionName: "lendingPoolMaxRate", args: [routerAddress], chainId: CHAIN.id },
    ],
    query: { enabled: !!irmAddress && !!routerAddress },
  });

  const baseRate = irmParams?.[0]?.result as bigint | undefined;
  const rateAtOptimal = irmParams?.[1]?.result as bigint | undefined;
  const optimalUtilization = irmParams?.[2]?.result as bigint | undefined;
  const maxUtilization = irmParams?.[3]?.result as bigint | undefined;
  const maxRate = irmParams?.[4]?.result as bigint | undefined;

  const optimalPct = optimalUtilization ? Number(optimalUtilization) / 1e18 * 100 : 0;
  const maxUtilPct = maxUtilization ? Number(maxUtilization) / 1e18 * 100 : 100;

  const curveData = useMemo<RatePoint[]>(() => {
    if (!baseRate || !rateAtOptimal || !optimalUtilization || !maxRate) return [];

    const base = Number(baseRate) / 1e18 * 100;
    const atOptimal = Number(rateAtOptimal) / 1e18 * 100;
    const max = Number(maxRate) / 1e18 * 100;
    const optPct = optimalPct;
    const maxPct = maxUtilPct;

    const resolution = 200;
    const points: RatePoint[] = [];

    for (let i = 0; i <= resolution; i++) {
      const util = (i / resolution) * 100;
      let rate: number;

      if (util <= optPct) {
        // Linear from baseRate to rateAtOptimal
        const t = optPct > 0 ? util / optPct : 0;
        rate = base + t * (atOptimal - base);
      } else if (util <= maxPct) {
        // Linear from rateAtOptimal to maxRate
        const t = maxPct > optPct ? (util - optPct) / (maxPct - optPct) : 0;
        rate = atOptimal + t * (max - atOptimal);
      } else {
        rate = max;
      }

      points.push({ utilization: Math.round(util * 100) / 100, borrowRate: rate });
    }

    return points;
  }, [baseRate, rateAtOptimal, optimalUtilization, maxRate, optimalPct, maxUtilPct]);

  // Find current borrow rate from curve
  const currentRate = useMemo(() => {
    if (curveData.length === 0) return 0;
    const closest = curveData.reduce((prev, curr) =>
      Math.abs(curr.utilization - currentUtilization) < Math.abs(prev.utilization - currentUtilization) ? curr : prev
    );
    return closest.borrowRate;
  }, [curveData, currentUtilization]);

  const maxY = useMemo(() => {
    if (curveData.length === 0) return 10;
    return Math.max(...curveData.map((d) => d.borrowRate)) * 1.15;
  }, [curveData]);

  const renderTooltip = useCallback(({ active, payload }: { active?: boolean; payload?: readonly { payload: RatePoint }[] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-[var(--bg-card)] border border-white/[0.08] rounded-lg px-4 py-3 shadow-lg space-y-2">
        <div className="flex items-center justify-between gap-6">
          <span className="text-xs text-[var(--text-tertiary)]">Utilization Rate</span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">{d.utilization.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-xs text-[var(--text-tertiary)]">Borrow APR</span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">{d.borrowRate.toFixed(2)}%</span>
        </div>
      </div>
    );
  }, []);

  if (isLoading) {
    return (
      <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    );
  }

  if (curveData.length === 0) return null;

  return (
    <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">Interest Rate Model</div>
          <div className="text-xs text-[var(--text-tertiary)]">Utilization Rate</div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {currentUtilization.toFixed(2)}<span className="text-base">%</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#c084fc" }} />
          <span className="text-xs text-[var(--text-tertiary)]">Borrow APR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgb(1, 107, 229)" }} />
          <span className="text-xs text-[var(--text-tertiary)]">Utilization Rate</span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={curveData} margin={{ top: 20, right: 15, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255, 255, 255, 0.06)"
            vertical={false}
          />

          <XAxis
            dataKey="utilization"
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgb(100, 100, 110)", fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
            domain={[0, 100]}
            dy={8}
          />

          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgb(100, 100, 110)", fontSize: 11 }}
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            domain={[0, maxY]}
            width={45}
          />

          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
          />

          {/* Borrow rate curve */}
          <Line
            type="monotone"
            dataKey="borrowRate"
            stroke="#c084fc"
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 5,
              fill: "#c084fc",
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />

          {/* Optimal utilization reference line */}
          {optimalPct > 0 && (
            <ReferenceLine
              x={Math.round(optimalPct * 100) / 100}
              stroke="rgb(1, 107, 229)"
              strokeDasharray="5 2"
              strokeWidth={1}
              label={{
                value: `Optimal ${optimalPct.toFixed(0)}%`,
                position: "top",
                fill: "rgb(1, 107, 229)",
                fontSize: 10,
              }}
            />
          )}

          {/* Current utilization reference line */}
          <ReferenceLine
            x={Math.round(currentUtilization * 100) / 100}
            stroke="#0062D2"
            strokeDasharray="5 2"
            strokeWidth={1}
            label={{
              value: `Current ${currentUtilization.toFixed(2)}%`,
              position: "top",
              fill: "#62677B",
              fontSize: 10,
            }}
          />

          {/* Current utilization dot on curve */}
          <ReferenceDot
            x={Math.round(currentUtilization * 100) / 100}
            y={currentRate}
            r={5}
            fill="#0062D2"
            stroke="#fff"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
