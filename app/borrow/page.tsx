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

export default function BorrowPage() {
  const cardRef = useRef<HTMLDivElement>(null);

  // Step 1: router address
  const { data: routerAddress } = useReadContract({
    address: LENDING_POOL_ADDRESS,
    abi: lendingPoolAbi,
    functionName: "router",
    chainId: CHAIN.id,
  });

  // Step 2: pool data from router
  const { data: routerData } = useReadContracts({
    contracts: [
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "borrowToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "collateralToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalSupplyAssets", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalBorrowAssets", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "ltv", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "factory", chainId: CHAIN.id },
    ],
    query: { enabled: !!routerAddress },
  });

  const borrowTokenAddr = routerData?.[0]?.result as `0x${string}` | undefined;
  const collateralTokenAddr = routerData?.[1]?.result as `0x${string}` | undefined;
  const totalSupply = routerData?.[2]?.result as bigint | undefined;
  const totalBorrow = routerData?.[3]?.result as bigint | undefined;
  const ltvRaw = routerData?.[4]?.result as bigint | undefined;
  const factoryAddr = routerData?.[5]?.result as `0x${string}` | undefined;

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
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "name", chainId: CHAIN.id },
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "decimals", chainId: CHAIN.id },
    ],
    query: { enabled: !!collateralTokenAddr },
  });

  // Step 4: IRM address from factory
  const { data: irmAddress } = useReadContract({
    address: factoryAddr,
    abi: lendingPoolFactoryAbi,
    functionName: "interestRateModel",
    chainId: CHAIN.id,
    query: { enabled: !!factoryAddr },
  });

  // Step 5: borrow rate from IRM
  const totalSupplyVal = totalSupply ?? 0n;
  const totalBorrowVal = totalBorrow ?? 0n;

  const { data: irmData } = useReadContracts({
    contracts: [
      { address: irmAddress as `0x${string}`, abi: interestRateModelAbi, functionName: "calculateBorrowRate", args: [routerAddress!, totalSupplyVal, totalBorrowVal], chainId: CHAIN.id },
    ],
    query: { enabled: !!irmAddress && !!routerAddress && totalSupplyVal > 0n && totalBorrowVal > 0n },
  });

  const borrowRate = irmData?.[0]?.result as bigint | undefined;

  const borrowSymbol = (borrowInfo?.[0]?.result as string) ?? "";
  const borrowDecimals = (borrowInfo?.[2]?.result as number) ?? 18;
  const collateralSymbol = (collateralInfo?.[0]?.result as string) ?? "";

  const liquidity =
    totalSupply !== undefined && totalBorrow !== undefined
      ? totalSupply - totalBorrow
      : undefined;

  const ltv = ltvRaw ? Number(ltvRaw) / 1e16 : 0;

  // Borrow APY = borrowRate (already annualized from IRM)
  const borrowApy = borrowRate ? Number(borrowRate) / 1e18 * 100 : 0;

  const isLoading = !borrowSymbol;

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
        <div className="hidden lg:grid grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] px-6 py-3 border-b border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Collateral</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Loan</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">LTV</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Total Market Size</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Total Liquidity</div>
          <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-right">Rate</div>
        </div>

        {/* Row — skeleton or real data */}
        <Link
          href={`/borrow/${LENDING_POOL_ADDRESS}`}
          className="grid lg:grid-cols-[1.2fr_1fr_0.7fr_1.5fr_1.5fr_0.6fr] items-center px-6 py-5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
        >
          {/* Collateral */}
          <div className="flex items-center gap-3">
            {isLoading ? (
              <>
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
                <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </>
            ) : (
              <>
                <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={32} />
                <span className="font-medium text-[var(--text-primary)]">{collateralSymbol}</span>
              </>
            )}
          </div>

          {/* Loan */}
          <div className="flex items-center gap-3">
            {isLoading ? (
              <>
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
                <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </>
            ) : (
              <>
                <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={32} />
                <span className="font-medium text-[var(--text-primary)]">{borrowSymbol}</span>
              </>
            )}
          </div>

          {/* LTV */}
          <div>
            {isLoading ? (
              <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            ) : (
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {ltv.toFixed(2)}%
              </span>
            )}
          </div>

          {/* Total Market Size */}
          <div>
            {isLoading ? (
              <div className="h-4 w-36 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            ) : (
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {totalSupply !== undefined ? `${formatAmount(totalSupply, borrowDecimals)} ${borrowSymbol}` : "—"}
              </span>
            )}
          </div>

          {/* Total Liquidity */}
          <div>
            {isLoading ? (
              <div className="h-4 w-36 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            ) : (
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {liquidity !== undefined ? `${formatAmount(liquidity, borrowDecimals)} ${borrowSymbol}` : "—"}
              </span>
            )}
          </div>

          {/* Rate */}
          <div className="text-right">
            {isLoading ? (
              <div className="h-4 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
            ) : (
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {borrowApy.toFixed(2)}%
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
