"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import TokenIcon from "@/components/TokenIcon";
import { usePoolData } from "@/hooks/usePoolData";
import { useLendingPools } from "@/hooks/useLendingPools";
import { gsap } from "@/hooks/useGsap";

const TOKEN_COLORS: Record<string, string> = {
  ETH: "#627eea", WETH: "#627eea", WBTC: "#f7931a", USDC: "#2775ca",
  USDT: "#26a17b", DAI: "#f5ac37", ARB: "#28a0f0", LINK: "#2a5ada",
};

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol.toUpperCase()] ?? "#6366f1";
}

function formatAmount(value: bigint, decimals: number): string {
  const num = Number(formatUnits(value, decimals));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  if (num > 0) return num.toFixed(6);
  return "0.00";
}

function EarnPoolRow({ poolAddress }: { poolAddress: `0x${string}` }) {
  const { data: pool, isLoading } = usePoolData(poolAddress);

  if (isLoading || !pool) {
    return (
      <div className="px-4 md:px-6 py-5 border-b border-white/[0.12] md:border-white/[0.06] last:border-b-0">
        {/* Mobile skeleton */}
        <div className="md:hidden flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-3 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse" />
        </div>
        {/* Desktop skeleton */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1.2fr_1.2fr_0.8fr] items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
            <div className="space-y-1.5">
              <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              <div className="h-3 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-4 w-12 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
          <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
          <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/earn/${poolAddress}`}
      className="block md:grid md:grid-cols-[2fr_1fr_1.2fr_1.2fr_0.8fr] md:items-center px-4 md:px-6 py-4 md:py-5 border-b border-white/[0.12] md:border-white/[0.06] last:border-b-0 hover:bg-white/[0.05] transition-colors cursor-pointer"
    >
      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-3">
        {/* Top: Asset + APY */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TokenIcon symbol={pool.borrowSymbol} color={getTokenColor(pool.borrowSymbol)} size={36} />
            <div>
              <div className="font-semibold text-[var(--text-primary)]">{pool.borrowSymbol}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <TokenIcon symbol={pool.collateralSymbol} color={getTokenColor(pool.collateralSymbol)} size={16} />
                <span className="text-xs text-[var(--text-tertiary)]">{pool.collateralSymbol}</span>
                <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">
                  {pool.ltv.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold text-[var(--accent)]">{pool.supplyApy.toFixed(2)}%</span>
            <span className="text-[10px] text-[var(--text-tertiary)] block">APY</span>
          </div>
        </div>

        {/* Bottom: Deposits + Liquidity */}
        <div className="flex items-end justify-between pt-2 border-t border-white/[0.04]">
          <div>
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Total Deposits</span>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {formatAmount(pool.totalSupply, pool.borrowDecimals)} {pool.borrowSymbol}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Liquidity</span>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {formatAmount(pool.liquidity, pool.borrowDecimals)} {pool.borrowSymbol}
            </span>
          </div>
        </div>
      </div>

      {/* ── Desktop layout (grid cells) ── */}
      {/* Asset */}
      <div className="hidden md:flex items-center gap-3">
        <TokenIcon symbol={pool.borrowSymbol} color={getTokenColor(pool.borrowSymbol)} size={36} />
        <div>
          <div className="font-semibold text-[var(--text-primary)]">{pool.borrowSymbol}</div>
          <div className="text-xs text-[var(--text-tertiary)]">{pool.borrowName}</div>
        </div>
      </div>

      {/* Collateral */}
      <div className="hidden md:flex items-center gap-2">
        <TokenIcon symbol={pool.collateralSymbol} color={getTokenColor(pool.collateralSymbol)} size={24} />
        <span className="text-sm font-medium text-[var(--text-primary)]">{pool.collateralSymbol}</span>
        <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded-full">
          {pool.ltv.toFixed(0)}%
        </span>
      </div>

      {/* Total Deposits */}
      <div className="hidden md:block text-right">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {formatAmount(pool.totalSupply, pool.borrowDecimals)} {pool.borrowSymbol}
        </div>
      </div>

      {/* Liquidity */}
      <div className="hidden md:block text-right">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {formatAmount(pool.liquidity, pool.borrowDecimals)} {pool.borrowSymbol}
        </div>
      </div>

      {/* APY */}
      <div className="hidden md:block text-right">
        <span className="text-sm font-medium text-[var(--accent)]">
          {pool.supplyApy.toFixed(2)}%
        </span>
      </div>
    </Link>
  );
}

export default function EarnPage() {
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: poolAddresses, isLoading: isLoadingPools } = useLendingPools();

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    if (cardRef.current) {
      gsap.set(cardRef.current, { opacity: 0, y: 20 });
      tl.to(cardRef.current, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
    }
  }, []);

  return (
    <div className="space-y-6">
      <div ref={cardRef} className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1.2fr_1.2fr_0.8fr] px-6 py-3 border-b border-white/[0.06]">
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Asset</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Collateral</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Total Deposits</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Liquidity</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">APY</div>
        </div>

        {/* Rows — one per pool address */}
        {isLoadingPools && (
          <div className="px-6 py-8 text-center text-sm text-[var(--text-tertiary)]">Loading pools...</div>
        )}
        {poolAddresses?.map((addr) => (
          <EarnPoolRow key={addr} poolAddress={addr} />
        ))}
      </div>
    </div>
  );
}
