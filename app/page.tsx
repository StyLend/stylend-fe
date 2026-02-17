"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { useQuery } from "@tanstack/react-query";
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { usePoolData, type PoolData } from "@/hooks/usePoolData";
import { LENDING_POOL_ADDRESSES, CHAIN } from "@/lib/contracts";
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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// ── User positions across all pools ──

interface PoolPosition {
  pool: PoolData;
  depositAmount: bigint;
  depositUsd: number;
  borrowAmount: bigint;
  borrowUsd: number;
  collateralAmount: bigint;
  collateralUsd: number;
  hasPosition: boolean;
}

interface UserPositions {
  totalDepositUsd: number;
  totalBorrowUsd: number;
  totalCollateralUsd: number;
  deposits: PoolPosition[];
  loans: PoolPosition[];
  collaterals: PoolPosition[];
}

function useUserPositions(
  pools: (PoolData | undefined)[],
  userAddress: `0x${string}` | undefined
) {
  const client = usePublicClient({ chainId: CHAIN.id });
  const loadedPools = pools.filter(Boolean) as PoolData[];

  return useQuery<UserPositions>({
    queryKey: [
      "userPositions",
      loadedPools.map((p) => p.poolAddress),
      userAddress,
    ],
    queryFn: async () => {
      if (!client || !userAddress)
        return {
          totalDepositUsd: 0,
          totalBorrowUsd: 0,
          totalCollateralUsd: 0,
          deposits: [],
          loans: [],
          collaterals: [],
        };

      const positions: PoolPosition[] = await Promise.all(
        loadedPools.map(async (pool) => {
          // 1. Read shares token
          const sharesTokenAddr = (await client.readContract({
            address: pool.routerAddress,
            abi: lendingPoolRouterAbi,
            functionName: "sharesToken",
          })) as `0x${string}`;

          // 2. User shares + total shares
          const [userShares, totalShares] = (await Promise.all([
            client.readContract({
              address: sharesTokenAddr,
              abi: mockErc20Abi,
              functionName: "balanceOf",
              args: [userAddress],
            }),
            client.readContract({
              address: sharesTokenAddr,
              abi: mockErc20Abi,
              functionName: "totalSupply",
            }),
          ])) as [bigint, bigint];

          const depositAmount =
            totalShares > 0n
              ? (userShares * pool.totalSupply) / totalShares
              : 0n;

          // 3. User position address
          const positionAddr = (await client.readContract({
            address: pool.routerAddress,
            abi: lendingPoolRouterAbi,
            functionName: "addressPositions",
            args: [userAddress],
          })) as `0x${string}`;

          const hasPosition = positionAddr !== ZERO_ADDR;

          // 4. Borrow shares
          let borrowAmount = 0n;
          let collateralAmount = 0n;

          if (hasPosition) {
            const [userBorrowShares, totalBorrowShares, colBal] =
              (await Promise.all([
                client.readContract({
                  address: pool.routerAddress,
                  abi: lendingPoolRouterAbi,
                  functionName: "userBorrowShares",
                  args: [userAddress],
                }),
                client.readContract({
                  address: pool.routerAddress,
                  abi: lendingPoolRouterAbi,
                  functionName: "totalBorrowShares",
                }),
                client.readContract({
                  address: pool.collateralTokenAddr,
                  abi: mockErc20Abi,
                  functionName: "balanceOf",
                  args: [positionAddr],
                }),
              ])) as [bigint, bigint, bigint];

            borrowAmount =
              totalBorrowShares > 0n && pool.totalBorrow > 0n
                ? (userBorrowShares * pool.totalBorrow) / totalBorrowShares
                : 0n;

            collateralAmount = colBal;
          }

          // 5. USD conversions
          const depositUsd =
            Number(formatUnits(depositAmount, pool.borrowDecimals)) *
            Number(formatUnits(pool.borrowPrice, pool.borrowPriceDecimals));

          const borrowUsd =
            Number(formatUnits(borrowAmount, pool.borrowDecimals)) *
            Number(formatUnits(pool.borrowPrice, pool.borrowPriceDecimals));

          const collateralUsd =
            Number(formatUnits(collateralAmount, pool.collateralDecimals)) *
            Number(
              formatUnits(pool.collateralPrice, pool.collateralPriceDecimals)
            );

          return {
            pool,
            depositAmount,
            depositUsd,
            borrowAmount,
            borrowUsd,
            collateralAmount,
            collateralUsd,
            hasPosition,
          };
        })
      );

      const deposits = positions.filter((p) => p.depositAmount > 0n);
      const loans = positions.filter((p) => p.borrowAmount > 0n);
      const collaterals = positions.filter((p) => p.collateralAmount > 0n);

      return {
        totalDepositUsd: positions.reduce((s, p) => s + p.depositUsd, 0),
        totalBorrowUsd: positions.reduce((s, p) => s + p.borrowUsd, 0),
        totalCollateralUsd: positions.reduce(
          (s, p) => s + p.collateralUsd,
          0
        ),
        deposits,
        loans,
        collaterals,
      };
    },
    enabled: !!client && !!userAddress && loadedPools.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ── Position rows ──

type BorrowTab = "loans" | "collateral";

function EarnPositionRow({ pos }: { pos: PoolPosition }) {
  const { pool, depositAmount, depositUsd } = pos;

  return (
    <Link
      href={`/earn/${pool.poolAddress}`}
      className="block bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:bg-[var(--bg-card-hover)] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TokenIcon
            symbol={pool.borrowSymbol}
            color={getTokenColor(pool.borrowSymbol)}
            size={36}
          />
          <div>
            <div className="font-semibold text-[var(--text-primary)]">
              {pool.borrowSymbol}
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {pool.collateralSymbol}/{pool.borrowSymbol} Pool
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {fmt(depositAmount, pool.borrowDecimals)} {pool.borrowSymbol}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {formatUsd(depositUsd)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function BorrowPositionRow({
  pos,
  mode,
}: {
  pos: PoolPosition;
  mode: "loan" | "collateral";
}) {
  const { pool, borrowAmount, borrowUsd, collateralAmount, collateralUsd } =
    pos;

  const amount = mode === "loan" ? borrowAmount : collateralAmount;
  const decimals =
    mode === "loan" ? pool.borrowDecimals : pool.collateralDecimals;
  const symbol = mode === "loan" ? pool.borrowSymbol : pool.collateralSymbol;
  const usd = mode === "loan" ? borrowUsd : collateralUsd;

  return (
    <Link
      href={`/borrow/${pool.poolAddress}`}
      className="block bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:bg-[var(--bg-card-hover)] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-9 shrink-0">
            <div className="absolute left-0 z-10">
              <TokenIcon
                symbol={pool.collateralSymbol}
                color={getTokenColor(pool.collateralSymbol)}
                size={36}
              />
            </div>
            <div className="absolute left-5">
              <TokenIcon
                symbol={pool.borrowSymbol}
                color={getTokenColor(pool.borrowSymbol)}
                size={36}
              />
            </div>
          </div>
          <div>
            <div className="font-semibold text-[var(--text-primary)]">
              {pool.collateralSymbol}-{pool.borrowSymbol} Pool
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">
              Arbitrum Sepolia
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {fmt(amount, decimals)} {symbol}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {formatUsd(usd)}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Main Dashboard ──

export default function Home() {
  const { address, isConnected } = useAccount();
  const [borrowTab, setBorrowTab] = useState<BorrowTab>("loans");
  const earnSectionRef = useRef<HTMLDivElement>(null);
  const borrowSectionRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const loansTabRef = useRef<HTMLButtonElement>(null);
  const collateralTabRef = useRef<HTMLButtonElement>(null);
  const isFirstTab = useRef(true);

  // Fetch all pool data
  const pool0 = usePoolData(LENDING_POOL_ADDRESSES[0]);
  const pool1 = usePoolData(LENDING_POOL_ADDRESSES[1]);
  const loadedPools = [pool0.data, pool1.data];

  // Fetch user positions across all pools
  const { data: userPositions } = useUserPositions(loadedPools, address);

  // ── Animations ──

  useEffect(() => {
    const activeEl =
      borrowTab === "loans" ? loansTabRef.current : collateralTabRef.current;
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
      tl.to(earnSectionRef.current, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
      });
    }

    if (borrowSectionRef.current) {
      gsap.set(borrowSectionRef.current, { opacity: 0, y: 25 });
      tl.to(
        borrowSectionRef.current,
        { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" },
        "-=0.3"
      );
    }
  }, []);

  const hasDeposits =
    userPositions?.deposits && userPositions.deposits.length > 0;
  const hasLoans = userPositions?.loans && userPositions.loans.length > 0;
  const hasCollaterals =
    userPositions?.collaterals && userPositions.collaterals.length > 0;

  return (
    <div className="space-y-12">
      {/* ============ EARN SECTION ============ */}
      <div ref={earnSectionRef} className="space-y-5">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] font-panchang">
          Earn
        </h2>

        {/* Your deposits card - USD total */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6">
          <div className="text-sm text-[var(--text-secondary)] mb-1">
            Your deposits
          </div>
          <div className="text-4xl font-bold text-[var(--text-primary)]">
            {isConnected && userPositions
              ? formatUsd(userPositions.totalDepositUsd)
              : "$0.00"}
          </div>
        </div>

        {/* Pool positions or empty state */}
        {isConnected && hasDeposits ? (
          <div className="space-y-3">
            {userPositions!.deposits.map((pos) => (
              <EarnPositionRow key={pos.pool.poolAddress} pos={pos} />
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl py-12 text-center">
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              No active Earn positions.
            </p>
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
        <h2 className="text-2xl font-bold text-[var(--text-primary)] font-panchang">
          Borrow
        </h2>

        {/* Your loans / collateral card - USD total */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6">
          <div
            ref={tabContainerRef}
            className="relative flex items-center gap-1 mb-3"
          >
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
            {isConnected && userPositions
              ? borrowTab === "loans"
                ? formatUsd(userPositions.totalBorrowUsd)
                : formatUsd(userPositions.totalCollateralUsd)
              : "$0.00"}
          </div>
        </div>

        {/* Borrow position rows or empty state */}
        {isConnected &&
        ((borrowTab === "loans" && hasLoans) ||
          (borrowTab === "collateral" && hasCollaterals)) ? (
          <div className="space-y-3">
            {borrowTab === "loans"
              ? userPositions!.loans.map((pos) => (
                  <BorrowPositionRow
                    key={pos.pool.poolAddress}
                    pos={pos}
                    mode="loan"
                  />
                ))
              : userPositions!.collaterals.map((pos) => (
                  <BorrowPositionRow
                    key={pos.pool.poolAddress}
                    pos={pos}
                    mode="collateral"
                  />
                ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl py-12 text-center">
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              No active Borrow positions.
            </p>
            <Link
              href="/borrow"
              className="inline-block px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors"
            >
              Start Borrowing
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
