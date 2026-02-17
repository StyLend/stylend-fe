"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { LENDING_POOL_ADDRESS, CHAIN } from "@/lib/contracts";
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

export default function EarnPage() {
  const cardRef = useRef<HTMLDivElement>(null);

  // Step 1: router address
  const { data: routerAddress } = useReadContract({
    address: LENDING_POOL_ADDRESS,
    abi: lendingPoolAbi,
    functionName: "router",
    chainId: CHAIN.id,
  });

  // Step 2: pool data from router (+ factory address)
  const { data: routerData } = useReadContracts({
    contracts: [
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "borrowToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "collateralToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalSupplyAssets", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalBorrowAssets", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "factory", chainId: CHAIN.id },
    ],
    query: { enabled: !!routerAddress },
  });

  const borrowTokenAddr = routerData?.[0]?.result as `0x${string}` | undefined;
  const collateralTokenAddr = routerData?.[1]?.result as `0x${string}` | undefined;
  const totalSupply = routerData?.[2]?.result as bigint | undefined;
  const totalBorrow = routerData?.[3]?.result as bigint | undefined;
  const factoryAddr = routerData?.[4]?.result as `0x${string}` | undefined;

  // Step 3: token info
  const { data: borrowInfo } = useReadContracts({
    contracts: [
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "symbol", chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "name", chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "decimals", chainId: CHAIN.id },
    ],
    query: { enabled: !!borrowTokenAddr },
  });

  const { data: collateralInfo } = useReadContracts({
    contracts: [
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "symbol", chainId: CHAIN.id },
    ],
    query: { enabled: !!collateralTokenAddr },
  });

  // Step 4: get InterestRateModel address from factory
  const { data: irmAddress } = useReadContract({
    address: factoryAddr,
    abi: lendingPoolFactoryAbi,
    functionName: "interestRateModel",
    chainId: CHAIN.id,
    query: { enabled: !!factoryAddr },
  });

  // Step 5: get borrow rate + reserve factor from IRM
  const totalSupplyVal = totalSupply ?? 0n;
  const totalBorrowVal = totalBorrow ?? 0n;

  const { data: irmData } = useReadContracts({
    contracts: [
      { address: irmAddress as `0x${string}`, abi: interestRateModelAbi, functionName: "calculateBorrowRate", args: [routerAddress!, totalSupplyVal, totalBorrowVal], chainId: CHAIN.id },
      { address: irmAddress as `0x${string}`, abi: interestRateModelAbi, functionName: "tokenReserveFactor", args: [routerAddress!], chainId: CHAIN.id },
    ],
    query: { enabled: !!irmAddress && !!routerAddress && totalSupplyVal > 0n && totalBorrowVal > 0n },
  });

  const borrowRate = irmData?.[0]?.result as bigint | undefined;
  const reserveFactor = irmData?.[1]?.result as bigint | undefined;

  const borrowSymbol = (borrowInfo?.[0]?.result as string) ?? "";
  const borrowName = (borrowInfo?.[1]?.result as string) ?? "";
  const borrowDecimals = (borrowInfo?.[2]?.result as number) ?? 18;
  const collateralSymbol = (collateralInfo?.[0]?.result as string) ?? "";

  const liquidity =
    totalSupply !== undefined && totalBorrow !== undefined
      ? totalSupply - totalBorrow
      : undefined;

  // Supply APY = borrowRate * utilization * (1 - reserveFactor)
  // All values in WAD (1e18 = 100%)
  const supplyApy = (() => {
    if (!totalSupply || totalSupply === 0n || borrowRate === undefined) return 0;
    const borrowRateNum = Number(borrowRate) / 1e18;
    const utilizationNum = Number(totalBorrow ?? 0n) / Number(totalSupply);
    // Default reserve factor is 10e16 (10%) if not set (0)
    const reserveFactorNum = reserveFactor && reserveFactor > 0n
      ? Number(reserveFactor) / 1e18
      : 0.1;
    return borrowRateNum * utilizationNum * (1 - reserveFactorNum) * 100;
  })();

  const isLoading = !borrowSymbol;

  // GSAP — animate the whole card on mount, same pattern as other pages
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    if (cardRef.current) {
      gsap.set(cardRef.current, { opacity: 0, y: 20 });
      tl.to(cardRef.current, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
    }
  }, []);

  return (
    <div className="space-y-6">
      <div ref={cardRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2.2fr_1.4fr_1.4fr_1fr_0.8fr] px-6 py-3 border-b border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Pool</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Total Deposits</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Liquidity</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-center">Collateral</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">APY</div>
        </div>

        {/* Always render the row structure — show skeleton when loading */}
        <Link
          href={`/earn/${LENDING_POOL_ADDRESS}`}
          className="grid md:grid-cols-[2.2fr_1.4fr_1.4fr_1fr_0.8fr] items-center px-6 py-5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
        >
          {/* Pool name */}
          <div className="flex items-center gap-3">
            {isLoading ? (
              <>
                <div className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                  <div className="h-3 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={36} />
                <div>
                  <div className="font-semibold text-[var(--text-primary)]">{borrowSymbol} Pool</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{borrowName}</div>
                </div>
              </>
            )}
          </div>

          {/* Total Deposits */}
          <div className="text-right">
            {isLoading ? (
              <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
            ) : (
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {totalSupply !== undefined
                  ? `${formatAmount(totalSupply, borrowDecimals)} ${borrowSymbol}`
                  : "—"}
              </div>
            )}
          </div>

          {/* Liquidity */}
          <div className="text-right">
            {isLoading ? (
              <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
            ) : (
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {liquidity !== undefined
                  ? `${formatAmount(liquidity, borrowDecimals)} ${borrowSymbol}`
                  : "—"}
              </div>
            )}
          </div>

          {/* Collateral */}
          <div className="flex justify-center">
            {isLoading ? (
              <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            ) : collateralSymbol ? (
              <div className="flex items-center gap-1.5">
                <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={24} />
                <span className="text-xs text-[var(--text-secondary)]">{collateralSymbol}</span>
              </div>
            ) : null}
          </div>

          {/* APY */}
          <div className="text-right">
            {isLoading ? (
              <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
            ) : (
              <span className="text-sm font-medium text-[var(--accent)]">
                {supplyApy.toFixed(2)}%
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
