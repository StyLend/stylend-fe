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

function PoolRow({ poolAddress }: { poolAddress: `0x${string}` }) {
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
        <div className="hidden md:grid grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
            <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
            <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
          <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/borrow/${poolAddress}`}
      className="block md:grid md:grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] md:items-center px-4 md:px-6 py-4 md:py-5 border-b border-white/[0.12] md:border-white/[0.06] last:border-b-0 hover:bg-white/[0.05] transition-colors cursor-pointer"
    >
      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-3">
        {/* Top: Collateral + Loan + Rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TokenIcon symbol={pool.collateralSymbol} color={getTokenColor(pool.collateralSymbol)} size={36} />
            <div>
              <div className="font-semibold text-[var(--text-primary)]">{pool.collateralSymbol}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <TokenIcon symbol={pool.borrowSymbol} color={getTokenColor(pool.borrowSymbol)} size={16} />
                <span className="text-xs text-[var(--text-tertiary)]">{pool.borrowSymbol}</span>
                <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">
                  {pool.ltv.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold text-[var(--accent)]">{pool.borrowApy.toFixed(2)}%</span>
            <span className="text-[10px] text-[var(--text-tertiary)] block">Borrow APY</span>
          </div>
        </div>

        {/* Bottom: Market Size + Liquidity */}
        <div className="flex items-end justify-between pt-2 border-t border-white/[0.04]">
          <div>
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Market Size</span>
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
      {/* Collateral */}
      <div className="hidden md:flex items-center gap-3">
        <TokenIcon symbol={pool.collateralSymbol} color={getTokenColor(pool.collateralSymbol)} size={32} />
        <span className="font-medium text-[var(--text-primary)]">{pool.collateralSymbol}</span>
      </div>

      {/* Loan */}
      <div className="hidden md:flex items-center gap-3">
        <TokenIcon symbol={pool.borrowSymbol} color={getTokenColor(pool.borrowSymbol)} size={32} />
        <span className="font-medium text-[var(--text-primary)]">{pool.borrowSymbol}</span>
      </div>

      {/* LTV */}
      <div className="hidden md:block">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {pool.ltv.toFixed(2)}%
        </span>
      </div>

      {/* Total Market Size */}
      <div className="hidden md:block">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {formatAmount(pool.totalSupply, pool.borrowDecimals)} {pool.borrowSymbol}
        </span>
      </div>

      {/* Total Liquidity */}
      <div className="hidden md:block">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {formatAmount(pool.liquidity, pool.borrowDecimals)} {pool.borrowSymbol}
        </span>
      </div>

      {/* Rate */}
      <div className="hidden md:block text-right">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {pool.borrowApy.toFixed(2)}%
        </span>
      </div>
    </Link>
  );
}

export default function BorrowPage() {
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
        <div className="hidden md:grid grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] px-6 py-3 border-b border-white/[0.06]">
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Collateral</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Loan</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">LTV</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Total Market Size</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Total Liquidity</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Rate</div>
        </div>

        {/* Rows — one per pool address */}
        {isLoadingPools && (
          <div className="px-6 py-8 text-center text-sm text-[var(--text-tertiary)]">Loading pools...</div>
        )}
        {poolAddresses?.map((addr) => (
          <PoolRow key={addr} poolAddress={addr} />
        ))}
      </div>
    </div>
  );
}
