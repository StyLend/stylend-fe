"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import TokenIcon from "@/components/TokenIcon";
import { usePoolData } from "@/hooks/usePoolData";
import { LENDING_POOL_ADDRESSES } from "@/lib/contracts";
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

  return (
    <Link
      href={`/borrow/${poolAddress}`}
      className="grid lg:grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] items-center px-6 py-5 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.05] transition-colors cursor-pointer"
    >
      {/* Collateral */}
      <div className="flex items-center gap-3">
        {isLoading || !pool ? (
          <>
            <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
            <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </>
        ) : (
          <>
            <TokenIcon symbol={pool.collateralSymbol} color={getTokenColor(pool.collateralSymbol)} size={32} />
            <span className="font-medium text-[var(--text-primary)]">{pool.collateralSymbol}</span>
          </>
        )}
      </div>

      {/* Loan */}
      <div className="flex items-center gap-3">
        {isLoading || !pool ? (
          <>
            <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
            <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </>
        ) : (
          <>
            <TokenIcon symbol={pool.borrowSymbol} color={getTokenColor(pool.borrowSymbol)} size={32} />
            <span className="font-medium text-[var(--text-primary)]">{pool.borrowSymbol}</span>
          </>
        )}
      </div>

      {/* LTV */}
      <div>
        {isLoading || !pool ? (
          <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse" />
        ) : (
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {pool.ltv.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Total Market Size */}
      <div>
        {isLoading || !pool ? (
          <div className="h-4 w-36 rounded bg-[var(--bg-tertiary)] animate-pulse" />
        ) : (
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {formatAmount(pool.totalSupply, pool.borrowDecimals)} {pool.borrowSymbol}
          </span>
        )}
      </div>

      {/* Total Liquidity */}
      <div>
        {isLoading || !pool ? (
          <div className="h-4 w-36 rounded bg-[var(--bg-tertiary)] animate-pulse" />
        ) : (
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {formatAmount(pool.liquidity, pool.borrowDecimals)} {pool.borrowSymbol}
          </span>
        )}
      </div>

      {/* Rate */}
      <div className="text-right">
        {isLoading || !pool ? (
          <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
        ) : (
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {pool.borrowApy.toFixed(2)}%
          </span>
        )}
      </div>
    </Link>
  );
}

export default function BorrowPage() {
  const cardRef = useRef<HTMLDivElement>(null);

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
        <div className="hidden lg:grid grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] px-6 py-3 border-b border-white/[0.06]">
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Collateral</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Loan</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">LTV</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Total Market Size</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Total Liquidity</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Rate</div>
        </div>

        {/* Rows — one per pool address */}
        {LENDING_POOL_ADDRESSES.map((addr) => (
          <PoolRow key={addr} poolAddress={addr} />
        ))}
      </div>
    </div>
  );
}
