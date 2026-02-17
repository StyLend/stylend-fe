"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { LENDING_POOL_ADDRESS, CHAIN } from "@/lib/contracts";
import { dashboardStats } from "@/lib/dummy-data";
import { gsap } from "@/hooks/useGsap";

const TOKEN_COLORS: Record<string, string> = {
  ETH: "#627eea", WETH: "#627eea", WBTC: "#f7931a", USDC: "#2775ca",
  USDT: "#26a17b", DAI: "#f5ac37", ARB: "#28a0f0", LINK: "#2a5ada",
};

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol.toUpperCase()] ?? "#6366f1";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function fmt(value: bigint, decimals: number): string {
  const num = Number(formatUnits(value, decimals));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  if (num > 0) return num.toFixed(6);
  return "0.00";
}

type BorrowTab = "loans" | "collateral";

export default function Home() {
  const { address: userAddress, isConnected } = useAccount();
  const [borrowTab, setBorrowTab] = useState<BorrowTab>("loans");
  const earnSectionRef = useRef<HTMLDivElement>(null);
  const borrowSectionRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const loansTabRef = useRef<HTMLButtonElement>(null);
  const collateralTabRef = useRef<HTMLButtonElement>(null);
  const isFirstTab = useRef(true);

  // ── Contract reads for Earn ──

  const { data: routerAddress } = useReadContract({
    address: LENDING_POOL_ADDRESS,
    abi: lendingPoolAbi,
    functionName: "router",
    chainId: CHAIN.id,
  });

  const { data: routerData } = useReadContracts({
    contracts: [
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "borrowToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "sharesToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalSupplyAssets", chainId: CHAIN.id },
    ],
    query: { enabled: !!routerAddress },
  });

  const borrowTokenAddr = routerData?.[0]?.result as `0x${string}` | undefined;
  const sharesTokenAddr = routerData?.[1]?.result as `0x${string}` | undefined;
  const totalSupplyAssets = routerData?.[2]?.result as bigint | undefined;

  const { data: tokenInfo } = useReadContracts({
    contracts: [
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "symbol", chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "decimals", chainId: CHAIN.id },
    ],
    query: { enabled: !!borrowTokenAddr },
  });

  const borrowSymbol = (tokenInfo?.[0]?.result as string) ?? "";
  const borrowDecimals = (tokenInfo?.[1]?.result as number) ?? 18;

  // User shares + total shares supply (to compute user's proportional deposit)
  const { data: sharesData } = useReadContracts({
    contracts: [
      { address: sharesTokenAddr, abi: mockErc20Abi, functionName: "balanceOf", args: [userAddress!], chainId: CHAIN.id },
      { address: sharesTokenAddr, abi: mockErc20Abi, functionName: "totalSupply", chainId: CHAIN.id },
    ],
    query: { enabled: !!sharesTokenAddr && !!userAddress },
  });

  const userShares = (sharesData?.[0]?.result as bigint) ?? 0n;
  const totalShares = (sharesData?.[1]?.result as bigint) ?? 0n;

  // User's deposit in underlying tokens: (userShares * totalSupplyAssets) / totalShares
  const userDepositAmount =
    totalShares > 0n && totalSupplyAssets !== undefined
      ? (userShares * totalSupplyAssets) / totalShares
      : 0n;

  const hasEarnPosition = isConnected && userShares > 0n;

  // ── Animations ──

  useEffect(() => {
    const activeEl = borrowTab === "loans" ? loansTabRef.current : collateralTabRef.current;
    const indicator = tabIndicatorRef.current;
    const container = tabContainerRef.current;
    if (!activeEl || !indicator || !container) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();

    const left = tabRect.left - containerRect.left;
    const width = tabRect.width;

    if (isFirstTab.current) {
      gsap.set(indicator, { x: left, width, opacity: 1 });
      isFirstTab.current = false;
    } else {
      gsap.to(indicator, {
        x: left,
        width,
        duration: 0.35,
        ease: "power3.out",
      });
    }
  }, [borrowTab]);

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    if (earnSectionRef.current) {
      gsap.set(earnSectionRef.current, { opacity: 0, y: 25 });
      tl.to(earnSectionRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
    }

    if (borrowSectionRef.current) {
      gsap.set(borrowSectionRef.current, { opacity: 0, y: 25 });
      tl.to(borrowSectionRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.3");
    }
  }, []);

  return (
    <div className="space-y-12">
      {/* ============ EARN SECTION ============ */}
      <div ref={earnSectionRef} className="space-y-5">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] font-panchang">Earn</h2>

        {/* Your deposits card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6">
          <div className="text-sm text-[var(--text-secondary)] mb-1">Your deposits</div>
          <div className="text-4xl font-bold text-[var(--text-primary)]">
            {hasEarnPosition
              ? `${fmt(userDepositAmount, borrowDecimals)} ${borrowSymbol}`
              : isConnected && borrowSymbol
              ? `0.00 ${borrowSymbol}`
              : "$0.00"}
          </div>
        </div>

        {/* Position or empty state */}
        {hasEarnPosition ? (
          <Link
            href={`/earn/${LENDING_POOL_ADDRESS}`}
            className="block bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={36} />
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{borrowSymbol} Pool</div>
                  <div className="text-xs text-[var(--text-tertiary)]">Arbitrum Sepolia</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {fmt(userDepositAmount, borrowDecimals)} {borrowSymbol}
                </div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {fmt(userShares, 18)} shares
                </div>
              </div>
            </div>
          </Link>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl py-12 text-center">
            <p className="text-sm text-[var(--text-tertiary)] mb-4">No active Earn positions.</p>
            <Link
              href="/earn"
              className="inline-block px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors"
            >
              Start Earning
            </Link>
          </div>
        )}
      </div>

      {/* ============ BORROW SECTION ============ */}
      <div ref={borrowSectionRef} className="space-y-5">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] font-panchang">Borrow</h2>

        {/* Your loans / collateral card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6">
          <div ref={tabContainerRef} className="relative flex items-center gap-1 mb-3">
            {/* Floating indicator */}
            <div
              ref={tabIndicatorRef}
              className="absolute top-0 h-full rounded-lg bg-[var(--bg-tertiary)] pointer-events-none z-0"
              style={{ opacity: 0 }}
            />
            <button
              ref={loansTabRef}
              onClick={() => setBorrowTab("loans")}
              className={`relative z-10 px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                borrowTab === "loans"
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Your loans
            </button>
            <button
              ref={collateralTabRef}
              onClick={() => setBorrowTab("collateral")}
              className={`relative z-10 px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                borrowTab === "collateral"
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Your collateral
            </button>
          </div>
          <div className="text-4xl font-bold text-[var(--text-primary)]">
            {borrowTab === "loans"
              ? formatUsd(dashboardStats.totalBorrowed)
              : formatUsd(dashboardStats.totalDeposited)}
          </div>
        </div>

        {/* Empty state card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl py-12 text-center">
          <p className="text-sm text-[var(--text-tertiary)] mb-4">No active Borrow positions.</p>
          <Link
            href="/borrow"
            className="inline-block px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors"
          >
            Start Borrowing
          </Link>
        </div>
      </div>
    </div>
  );
}
