"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { tokenDataStreamAbi } from "@/lib/abis/token-data-stream-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { useAllPoolsData, type PoolData } from "@/hooks/usePoolData";
import { useLendingPools } from "@/hooks/useLendingPools";
import { CHAIN } from "@/lib/contracts";
import { gsap } from "@/hooks/useGsap";
import PoolAreaChart from "@/components/charts/PoolAreaChart";
import TimePeriodSelect, { type TimePeriod, filterByTimePeriod } from "@/components/charts/TimePeriodSelect";
import { useAggregatedSnapshots, type PoolCollateralInfo } from "@/hooks/useAggregatedSnapshots";
import { useUserActivity, type ActivityFilter } from "@/hooks/useUserActivity";

const TOKEN_COLORS: Record<string, string> = {
  ETH: "#627eea", WETH: "#627eea", WBTC: "#f7931a", USDC: "#2775ca",
  USDT: "#26a17b", DAI: "#f5ac37", ARB: "#28a0f0", LINK: "#2a5ada",
};

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol.toUpperCase()] ?? "#6366f1";
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const KNOWN_TOKENS = [
  { symbol: "WETH", address: "0x48b3f901d040796f9cda37469fc5436fca711366" as `0x${string}`, decimals: 18, color: "#627EEA" },
  { symbol: "USDC", address: "0x5602a3f9b8a935df32871bb1c6289f24620233f7" as `0x${string}`, decimals: 6, color: "#2775CA" },
  { symbol: "USDT", address: "0x21483bcde6e19fdb5acc1375c443ebb17147a69a" as `0x${string}`, decimals: 6, color: "#50AF95" },
  { symbol: "WBTC", address: "0xacbc1ce1908b9434222e60d6cfed9e011a386220" as `0x${string}`, decimals: 8, color: "#F7931A" },
];

// ── User positions across all pools ──

interface PoolPosition {
  pool: PoolData;
  depositAmount: bigint;
  depositUsd: number;
  borrowAmount: bigint;
  borrowUsd: number;
  hasPosition: boolean;
}

interface CollateralItem {
  pool: PoolData;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenColor: string;
  amount: bigint;
  usd: number;
}

interface UserPositions {
  totalDepositUsd: number;
  totalBorrowUsd: number;
  totalCollateralUsd: number;
  deposits: PoolPosition[];
  loans: PoolPosition[];
  collaterals: CollateralItem[];
  positionAddresses: `0x${string}`[];
}

function useUserPositions(
  pools: PoolData[],
  userAddress: `0x${string}` | undefined
) {
  const client = usePublicClient({ chainId: CHAIN.id });
  const loadedPools = pools;

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
          positionAddresses: [],
        };

      const allCollaterals: CollateralItem[] = [];
      const allPositionAddrs: `0x${string}`[] = [];

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
          if (hasPosition) allPositionAddrs.push(positionAddr);

          // 4. Borrow shares + collateral (all known tokens)
          let borrowAmount = 0n;

          if (hasPosition) {
            const [userBorrowShares, totalBorrowShares] =
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
              ])) as [bigint, bigint];

            borrowAmount =
              totalBorrowShares > 0n && pool.totalBorrow > 0n
                ? (userBorrowShares * pool.totalBorrow) / totalBorrowShares
                : 0n;

            // Read all known token balances on position
            const tokenBalances = (await Promise.all(
              KNOWN_TOKENS.map((t) =>
                client.readContract({
                  address: t.address,
                  abi: mockErc20Abi,
                  functionName: "balanceOf",
                  args: [positionAddr],
                })
              )
            )) as bigint[];

            // Get factory → tokenDataStream for price lookups
            const factoryAddr = (await client.readContract({
              address: pool.routerAddress,
              abi: lendingPoolRouterAbi,
              functionName: "factory",
            })) as `0x${string}`;

            const tokenDataStreamAddr = (await client.readContract({
              address: factoryAddr,
              abi: lendingPoolFactoryAbi,
              functionName: "tokenDataStream",
            })) as `0x${string}`;

            // Build collateral items for non-zero balances
            for (let i = 0; i < KNOWN_TOKENS.length; i++) {
              if (tokenBalances[i] > 0n) {
                const token = KNOWN_TOKENS[i];
                let price = 0n;
                let priceDecimals = 8;
                try {
                  const [priceRound, priceDec] = (await Promise.all([
                    client.readContract({
                      address: tokenDataStreamAddr,
                      abi: tokenDataStreamAbi,
                      functionName: "latestRoundData",
                      args: [token.address],
                    }),
                    client.readContract({
                      address: tokenDataStreamAddr,
                      abi: tokenDataStreamAbi,
                      functionName: "decimals",
                      args: [token.address],
                    }),
                  ])) as [readonly [bigint, bigint, bigint, bigint, bigint], bigint];
                  price = priceRound[1];
                  priceDecimals = Number(priceDec);
                } catch { /* token not in price feed */ }

                const usd =
                  Number(formatUnits(tokenBalances[i], token.decimals)) *
                  Number(formatUnits(price, priceDecimals));

                allCollaterals.push({
                  pool,
                  tokenSymbol: token.symbol,
                  tokenDecimals: token.decimals,
                  tokenColor: token.color,
                  amount: tokenBalances[i],
                  usd,
                });
              }
            }
          }

          // 5. USD conversions
          const depositUsd =
            Number(formatUnits(depositAmount, pool.borrowDecimals)) *
            Number(formatUnits(pool.borrowPrice, pool.borrowPriceDecimals));

          const borrowUsd =
            Number(formatUnits(borrowAmount, pool.borrowDecimals)) *
            Number(formatUnits(pool.borrowPrice, pool.borrowPriceDecimals));

          return {
            pool,
            depositAmount,
            depositUsd,
            borrowAmount,
            borrowUsd,
            hasPosition,
          };
        })
      );

      const deposits = positions.filter((p) => p.depositAmount > 0n);
      const loans = positions.filter((p) => p.borrowAmount > 0n);

      return {
        totalDepositUsd: positions.reduce((s, p) => s + p.depositUsd, 0),
        totalBorrowUsd: positions.reduce((s, p) => s + p.borrowUsd, 0),
        totalCollateralUsd: allCollaterals.reduce((s, c) => s + c.usd, 0),
        deposits,
        loans,
        collaterals: allCollaterals,
        positionAddresses: allPositionAddrs,
      };
    },
    enabled: !!client && !!userAddress && loadedPools.length > 0,
    staleTime: 0,
    refetchInterval: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
}

// ── Position rows ──

type BorrowTab = "loans" | "collateral";

function EarnPositionsTable({ deposits }: { deposits: PoolPosition[] }) {
  return (
    <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
        <span>Asset</span>
        <span className="text-center">APY</span>
        <span className="text-center">Total Liquidity</span>
        <span className="text-right">Pool</span>
      </div>
      {/* Rows */}
      {deposits.map((pos) => (
        <Link
          key={pos.pool.poolAddress}
          href={`/earn/${pos.pool.poolAddress}`}
          className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr] items-center px-6 py-4 hover:bg-white/[0.05] transition-colors border-b border-white/[0.06] last:border-b-0"
        >
          {/* Asset: logo + balance */}
          <div className="flex items-center gap-3">
            <TokenIcon symbol={pos.pool.borrowSymbol} color={getTokenColor(pos.pool.borrowSymbol)} size={32} />
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {fmt(pos.depositAmount, pos.pool.borrowDecimals)} {pos.pool.borrowSymbol}
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">
                {formatUsd(pos.depositUsd)}
              </div>
            </div>
          </div>
          {/* APY */}
          <div className="text-center">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {pos.pool.supplyApy.toFixed(2)}%
            </span>
          </div>
          {/* Total Liquidity */}
          <div className="text-center">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {fmt(pos.pool.liquidity, pos.pool.borrowDecimals)} {pos.pool.borrowSymbol}
            </span>
          </div>
          {/* Pool: pair logos */}
          <div className="flex items-center justify-end gap-2">
            <div className="relative w-12 h-7">
              <div className="absolute left-0 z-10">
                <TokenIcon symbol={pos.pool.collateralSymbol} color={getTokenColor(pos.pool.collateralSymbol)} size={28} />
              </div>
              <div className="absolute left-4">
                <TokenIcon symbol={pos.pool.borrowSymbol} color={getTokenColor(pos.pool.borrowSymbol)} size={28} />
              </div>
            </div>
            <span className="text-xs text-[var(--text-secondary)] font-medium">
              {pos.pool.collateralSymbol}/{pos.pool.borrowSymbol}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Main Dashboard ──

export default function Home() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [borrowTab, setBorrowTab] = useState<BorrowTab>("loans");
  const [depositChartOpen, setDepositChartOpen] = useState(false);
  const [depositPeriod, setDepositPeriod] = useState<TimePeriod>("3M");
  const [borrowChartOpen, setBorrowChartOpen] = useState(false);
  const [borrowPeriod, setBorrowPeriod] = useState<TimePeriod>("3M");
  const depositChartRef = useRef<HTMLDivElement>(null);
  const borrowChartRef = useRef<HTMLDivElement>(null);
  const earnSectionRef = useRef<HTMLDivElement>(null);
  const borrowSectionRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const loansTabRef = useRef<HTMLButtonElement>(null);
  const collateralTabRef = useRef<HTMLButtonElement>(null);
  const isFirstTab = useRef(true);
  const borrowBalanceRef = useRef<HTMLDivElement>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activityPage, setActivityPage] = useState(1);
  const activitySectionRef = useRef<HTMLDivElement>(null);
  const activityTableRef = useRef<HTMLDivElement>(null);

  // Force refetch all dashboard data on mount (after navigating from action pages)
  useEffect(() => {
    queryClient.refetchQueries({ queryKey: ["poolData"] });
    queryClient.refetchQueries({ queryKey: ["userPositions"] });
  }, [queryClient]);

  // Fetch all pool addresses from indexer, then all pool data
  const { data: poolAddresses } = useLendingPools();
  const { data: allPoolsData, isLoading: isLoadingPools } = useAllPoolsData(poolAddresses);
  const loadedPools = allPoolsData ?? [];

  // Fetch user positions across all pools
  const { data: userPositions, isLoading: isLoadingPositions } = useUserPositions(loadedPools, address);

  // ── Collateral info per pool (for chart events matching) ──
  const collateralInfos = useMemo<PoolCollateralInfo[] | undefined>(() => {
    if (!loadedPools || loadedPools.length === 0) return undefined;
    return loadedPools.map((pool) => ({
      poolAddress: pool.poolAddress,
      routerAddress: pool.routerAddress,
      collateralDecimals: pool.collateralDecimals,
      collateralPrice: Number(formatUnits(pool.collateralPrice, pool.collateralPriceDecimals)),
    }));
  }, [loadedPools]);

  // ── Chart data (aggregated across all user pools) ──
  const { data: aggregatedSnapshots } = useAggregatedSnapshots(
    userPositions?.deposits,
    userPositions?.loans,
    collateralInfos,
    address,
  );
  const depositChartData = useMemo(
    () => (aggregatedSnapshots?.depositChart ? filterByTimePeriod(aggregatedSnapshots.depositChart, depositPeriod) : []),
    [aggregatedSnapshots, depositPeriod],
  );

  // ── User activity ──
  const { data: userActivity, isLoading: isActivityLoading } = useUserActivity(address);

  const poolLookup = useMemo(() => {
    const map = new Map<string, PoolData>();
    for (const pool of loadedPools) {
      map.set(pool.poolAddress.toLowerCase(), pool);
    }
    return map;
  }, [loadedPools]);

  const ACTIVITY_PER_PAGE = 10;
  const filteredActivity = useMemo(() => {
    if (!userActivity) return [];
    if (activityFilter === "all") return userActivity;
    return userActivity.filter((t) => t.type === activityFilter);
  }, [userActivity, activityFilter]);
  const activityTotalPages = Math.max(1, Math.ceil(filteredActivity.length / ACTIVITY_PER_PAGE));
  const paginatedActivity = useMemo(
    () => filteredActivity.slice((activityPage - 1) * ACTIVITY_PER_PAGE, activityPage * ACTIVITY_PER_PAGE),
    [filteredActivity, activityPage],
  );
  useEffect(() => { setActivityPage(1); }, [activityFilter]);

  // ── Expand/collapse deposit chart ──
  const toggleDepositChart = useCallback(() => {
    if (!depositChartOpen) {
      setDepositChartOpen(true);
    } else {
      const el = depositChartRef.current;
      if (!el) { setDepositChartOpen(false); return; }
      gsap.to(el, {
        height: 0, opacity: 0, duration: 0.35, ease: "power3.in",
        onComplete: () => setDepositChartOpen(false),
      });
    }
  }, [depositChartOpen]);

  // Animate deposit chart in after it mounts
  useEffect(() => {
    if (!depositChartOpen || !depositChartRef.current) return;
    const el = depositChartRef.current;
    gsap.set(el, { height: 0, opacity: 0, overflow: "hidden" });
    gsap.to(el, { height: "auto", opacity: 1, duration: 0.45, ease: "power3.out" });
  }, [depositChartOpen]);

  // ── Expand/collapse borrow chart ──
  const borrowChartData = useMemo(
    () => (aggregatedSnapshots?.borrowChart ? filterByTimePeriod(aggregatedSnapshots.borrowChart, borrowPeriod) : []),
    [aggregatedSnapshots, borrowPeriod],
  );
  const collateralChartData = useMemo(
    () => (aggregatedSnapshots?.collateralChart ? filterByTimePeriod(aggregatedSnapshots.collateralChart, borrowPeriod) : []),
    [aggregatedSnapshots, borrowPeriod],
  );

  const toggleBorrowChart = useCallback(() => {
    if (!borrowChartOpen) {
      setBorrowChartOpen(true);
    } else {
      const el = borrowChartRef.current;
      if (!el) { setBorrowChartOpen(false); return; }
      gsap.to(el, {
        height: 0, opacity: 0, duration: 0.35, ease: "power3.in",
        onComplete: () => setBorrowChartOpen(false),
      });
    }
  }, [borrowChartOpen]);

  // Animate borrow chart in after it mounts
  useEffect(() => {
    if (!borrowChartOpen || !borrowChartRef.current) return;
    const el = borrowChartRef.current;
    gsap.set(el, { height: 0, opacity: 0, overflow: "hidden" });
    gsap.to(el, { height: "auto", opacity: 1, duration: 0.45, ease: "power3.out" });
  }, [borrowChartOpen]);

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

  // Animate balance digits one by one on tab switch
  const isFirstBalance = useRef(true);
  useEffect(() => {
    if (isFirstBalance.current) { isFirstBalance.current = false; return; }
    if (!borrowBalanceRef.current) return;
    const chars = borrowBalanceRef.current.querySelectorAll<HTMLElement>(".balance-char");
    if (!chars.length) return;
    gsap.fromTo(chars,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.25, stagger: 0.03, ease: "power2.out" }
    );
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

    if (activitySectionRef.current) {
      gsap.set(activitySectionRef.current, { opacity: 0, y: 25 });
      tl.to(
        activitySectionRef.current,
        { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" },
        "-=0.3"
      );
    }
  }, []);

  // Animate activity rows on page/filter change
  useEffect(() => {
    if (!activityTableRef.current || paginatedActivity.length === 0) return;
    const rows = activityTableRef.current.querySelectorAll<HTMLElement>(".activity-row");
    if (!rows.length) return;
    gsap.fromTo(
      rows,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power3.out" },
    );
  }, [paginatedActivity, activityFilter, activityPage]);

  const hasDeposits =
    userPositions?.deposits && userPositions.deposits.length > 0;

  const totalLoanUsd = userPositions?.totalBorrowUsd ?? 0;

  // Build combined position rows for the table (Arbitrum + crosschain loans merged)
  const positionRows = useMemo(() => {
    if (!userPositions) return [];
    const poolMap = new Map<string, {
      pool: PoolData;
      collaterals: CollateralItem[];
      borrowAmount: bigint;
      borrowUsd: number;
      collateralUsd: number;
    }>();

    // Add from collaterals
    for (const c of userPositions.collaterals) {
      const key = c.pool.poolAddress;
      if (!poolMap.has(key)) {
        poolMap.set(key, {
          pool: c.pool,
          collaterals: [],
          borrowAmount: 0n,
          borrowUsd: 0,
          collateralUsd: 0,
        });
      }
      const entry = poolMap.get(key)!;
      entry.collaterals.push(c);
      entry.collateralUsd += c.usd;
    }

    // Add from loans
    for (const l of userPositions.loans) {
      const key = l.pool.poolAddress;
      if (!poolMap.has(key)) {
        poolMap.set(key, {
          pool: l.pool,
          collaterals: [],
          borrowAmount: 0n,
          borrowUsd: 0,
          collateralUsd: 0,
        });
      }
      const entry = poolMap.get(key)!;
      entry.borrowAmount = l.borrowAmount;
      entry.borrowUsd = l.borrowUsd;
    }

    return Array.from(poolMap.values());
  }, [userPositions]);

  const hasPositions = positionRows.length > 0;

  // Weighted average APY across all deposits
  const netApy = useMemo(() => {
    if (!userPositions?.deposits || userPositions.totalDepositUsd === 0) return 0;
    return userPositions.deposits.reduce(
      (sum, pos) => sum + pos.pool.supplyApy * (pos.depositUsd / userPositions.totalDepositUsd),
      0,
    );
  }, [userPositions]);

  // Weighted average borrow rate across all loans
  const netBorrowRate = useMemo(() => {
    if (!userPositions?.loans || userPositions.totalBorrowUsd === 0) return 0;
    return userPositions.loans.reduce(
      (sum, pos) => sum + pos.pool.borrowApy * (pos.borrowUsd / userPositions.totalBorrowUsd),
      0,
    );
  }, [userPositions]);

  // Loading state: connected but data not yet fetched
  const isDataLoading = isConnected && (isLoadingPools || !allPoolsData || isLoadingPositions);

  return (
    <div className="space-y-12">
      {/* ============ EARN SECTION ============ */}
      <div ref={earnSectionRef} className="space-y-5">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] font-panchang">
          Earn
        </h2>

        {/* Your deposits card - USD total + expandable chart */}
        <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-[var(--text-secondary)]">Your deposits</span>
            <button
              onClick={toggleDepositChart}
              className="p-1 rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
              title={depositChartOpen ? "Collapse" : "Expand chart"}
            >
              <Image
                src={depositChartOpen ? "/baseline-close-fullscreen.webp" : "/baseline-open-in-full.webp"}
                alt={depositChartOpen ? "Collapse" : "Expand"}
                width={16}
                height={16}
                className="invert opacity-60 hover:opacity-100 transition-opacity"
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            {isDataLoading ? (
              <div className="h-10 w-40 bg-[var(--bg-tertiary)] rounded-lg animate-pulse" />
            ) : (
              <div className="text-4xl font-bold text-[var(--text-primary)]">
                {isConnected && userPositions
                  ? formatUsd(userPositions.totalDepositUsd)
                  : "$0.00"}
              </div>
            )}
            {depositChartOpen && (
              <TimePeriodSelect value={depositPeriod} onChange={setDepositPeriod} />
            )}
          </div>

          {/* Expandable chart + APY sidebar */}
          {depositChartOpen && (
            <div ref={depositChartRef} className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              {/* Chart */}
              <div>
                {depositChartData.length > 0 ? (
                  <PoolAreaChart
                    data={depositChartData}
                    dataKey="totalDeposits"
                    gradientId="dashDepositGradient"
                    formatValue={(v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    yAxisFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`}
                  />
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-[var(--text-tertiary)]">
                    No historical data available
                  </div>
                )}
              </div>

              {/* Net APY sidebar */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 space-y-4 h-fit">
                <div>
                  <div className="text-xs text-[var(--text-tertiary)] mb-1">Net APY</div>
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {netApy.toFixed(2)}<span className="text-sm">%</span>
                  </div>
                </div>

                {/* APY breakdown */}
                {userPositions?.deposits && userPositions.deposits.length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--text-tertiary)] mb-2">APY breakdown</div>
                    <div className="space-y-2">
                      {userPositions.deposits.map((pos) => (
                        <div key={pos.pool.poolAddress} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <TokenIcon symbol={pos.pool.borrowSymbol} color={getTokenColor(pos.pool.borrowSymbol)} size={18} />
                            <span className="text-xs text-[var(--text-secondary)] truncate">
                              {pos.pool.collateralSymbol}/{pos.pool.borrowSymbol}
                            </span>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <span className="text-[10px] text-[var(--text-tertiary)]">{formatUsd(pos.depositUsd)}</span>
                            <span className="text-xs font-medium text-[var(--text-primary)]">{pos.pool.supplyApy.toFixed(2)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pool positions or empty state */}
        {isDataLoading ? (
          <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
              <span>Asset</span>
              <span className="text-center">APY</span>
              <span className="text-center">Total Liquidity</span>
              <span className="text-right">Pool</span>
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr] items-center px-6 py-4 border-b border-white/[0.06] last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-20 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                    <div className="h-3 w-14 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                  </div>
                </div>
                <div className="flex justify-center">
                  <div className="h-4 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
                <div className="flex justify-center">
                  <div className="h-4 w-20 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <div className="flex -space-x-2">
                    <div className="w-7 h-7 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                    <div className="w-7 h-7 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  </div>
                  <div className="h-3 w-16 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : isConnected && hasDeposits ? (
          <EarnPositionsTable deposits={userPositions!.deposits} />
        ) : (
          <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl py-12 text-center">
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

        {/* Your loans / collateral card + expandable chart */}
        <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <div
              ref={tabContainerRef}
              className="relative flex items-center gap-1"
            >
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
            <button
              onClick={toggleBorrowChart}
              className="p-1 rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
              title={borrowChartOpen ? "Collapse" : "Expand chart"}
            >
              <Image
                src={borrowChartOpen ? "/baseline-close-fullscreen.webp" : "/baseline-open-in-full.webp"}
                alt={borrowChartOpen ? "Collapse" : "Expand"}
                width={16}
                height={16}
                className="invert opacity-60 hover:opacity-100 transition-opacity"
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            {isDataLoading ? (
              <div className="h-10 w-40 bg-[var(--bg-tertiary)] rounded-lg animate-pulse" />
            ) : (
              <div ref={borrowBalanceRef} className="text-4xl font-bold text-[var(--text-primary)]">
                {(isConnected && userPositions
                  ? borrowTab === "loans"
                    ? formatUsd(totalLoanUsd)
                    : formatUsd(userPositions.totalCollateralUsd)
                  : "$0.00"
                ).split("").map((ch, i) => (
                  <span key={`${borrowTab}-${ch}-${i}`} className="balance-char inline-block">{ch}</span>
                ))}
              </div>
            )}
            {borrowChartOpen && (
              <TimePeriodSelect value={borrowPeriod} onChange={setBorrowPeriod} />
            )}
          </div>

          {/* Expandable chart + Net Rate sidebar */}
          {borrowChartOpen && (
            <div ref={borrowChartRef} className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              {/* Chart */}
              <div>
                {(borrowTab === "collateral" ? collateralChartData : borrowChartData).length > 0 ? (
                  <PoolAreaChart
                    data={borrowTab === "collateral" ? collateralChartData : borrowChartData}
                    dataKey={borrowTab === "collateral" ? "totalCollateral" : "totalBorrows"}
                    gradientId={`dashBorrow${borrowTab}Gradient`}
                    formatValue={(v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    yAxisFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`}
                  />
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-[var(--text-tertiary)]">
                    No historical data available
                  </div>
                )}
              </div>

              {/* Net Rate sidebar */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 space-y-4 h-fit">
                <div>
                  <div className="text-xs text-[var(--text-tertiary)] mb-1">Net Rate</div>
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {netBorrowRate.toFixed(2)}<span className="text-sm">%</span>
                  </div>
                </div>

                {userPositions?.loans && userPositions.loans.length > 0 ? (
                  <div className="space-y-2">
                    {userPositions.loans.map((pos) => (
                      <div key={pos.pool.poolAddress} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <TokenIcon symbol={pos.pool.borrowSymbol} color={getTokenColor(pos.pool.borrowSymbol)} size={18} />
                          <span className="text-xs text-[var(--text-secondary)] truncate">
                            {pos.pool.collateralSymbol}/{pos.pool.borrowSymbol}
                          </span>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-tertiary)]">{formatUsd(pos.borrowUsd)}</span>
                          <span className="text-xs font-medium text-[var(--text-primary)]">{pos.pool.borrowApy.toFixed(2)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    You currently have no Borrow position.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Position table — always visible */}
        {isDataLoading ? (
          <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1.5fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
              <span>Collateral</span>
              <span className="text-center">Loan</span>
              <span className="text-center">Rate</span>
              <span className="text-right">Health</span>
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="grid md:grid-cols-[2fr_1fr_1.5fr_1.5fr] items-center px-6 py-4 border-b border-white/[0.06] last:border-b-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-5.5 h-5.5 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  <div className="h-4 w-24 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                  <div className="h-4 w-14 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <div className="w-5.5 h-5.5 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  <div className="h-4 w-20 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                  <div className="h-4 w-14 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
                <div className="flex justify-center">
                  <div className="h-4 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
                <div className="flex justify-end">
                  <div className="h-4 w-10 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : isConnected && hasPositions ? (
          <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1.5fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
              <span>Collateral</span>
              <span className="text-center">Loan</span>
              <span className="text-center">Rate</span>
              <span className="text-right">Health</span>
            </div>

            {/* Rows — one per pool position */}
            {positionRows.map((row) => {
              const healthFactor = row.borrowUsd > 0 ? row.collateralUsd / row.borrowUsd : Infinity;
              const healthStr = row.borrowUsd === 0 ? "—" : healthFactor === Infinity ? "∞" : healthFactor.toFixed(2);
              const healthColor = "text-[var(--text-primary)]";

              return (
                <Link
                  key={row.pool.poolAddress}
                  href={`/borrow/${row.pool.poolAddress}`}
                  className="grid md:grid-cols-[2fr_1fr_1.5fr_1.5fr] items-center px-6 py-4 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  {/* Collateral */}
                  <div className="flex flex-col gap-1.5">
                    {row.collaterals.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <TokenIcon symbol={c.tokenSymbol} color={c.tokenColor} size={22} />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {fmt(c.amount, c.tokenDecimals)} {c.tokenSymbol}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                          {formatUsd(c.usd)}
                        </span>
                      </div>
                    ))}
                    {row.collaterals.length === 0 && (
                      <span className="text-sm text-[var(--text-tertiary)]">—</span>
                    )}
                  </div>

                  {/* Loan */}
                  <div className="flex flex-col gap-1.5 items-center">
                    {row.borrowAmount > 0n ? (
                      <div className="flex items-center gap-1.5">
                        <TokenIcon symbol={row.pool.borrowSymbol} color={getTokenColor(row.pool.borrowSymbol)} size={22} />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {fmt(row.borrowAmount, row.pool.borrowDecimals)} {row.pool.borrowSymbol}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                          {formatUsd(row.borrowUsd)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-[var(--text-tertiary)]">—</span>
                    )}
                  </div>

                  {/* Rate */}
                  <div className="text-center">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {row.pool.borrowApy.toFixed(2)}%
                    </span>
                  </div>

                  {/* Health */}
                  <div className="text-right">
                    <span className={`text-sm font-medium ${healthColor}`}>
                      {healthStr}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl py-12 text-center">
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

      {/* ──── Activity section ──── */}
      {isConnected && (
        <div ref={activitySectionRef} className="space-y-5">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] font-panchang">
            Activity
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["all", "deposit", "withdraw", "borrow", "repay", "supply-collateral", "withdraw-collateral"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      activityFilter === f
                        ? "bg-white/[0.1] text-[var(--text-primary)]"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]"
                    }`}
                  >
                    {f === "all" ? "All"
                      : f === "deposit" ? "Deposits"
                      : f === "withdraw" ? "Withdrawals"
                      : f === "borrow" ? "Borrows"
                      : f === "repay" ? "Repays"
                      : f === "supply-collateral" ? "Supply Collateral"
                      : "Withdraw Collateral"}
                  </button>
                ))}
              </div>
            </div>

            <div ref={activityTableRef} className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1.5fr_1.2fr_2fr_1.5fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
                <span className="flex items-center gap-1">
                  Date
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 7L2 4h6L5 7z" fill="currentColor" />
                  </svg>
                </span>
                <span>Type</span>
                <span>Amount</span>
                <span>Pool</span>
                <span className="text-right">Transaction</span>
              </div>

              {/* Rows */}
              {isActivityLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[1.5fr_1.2fr_2fr_1.5fr_1.5fr] items-center px-6 py-4 border-b border-white/[0.06] last:border-b-0">
                    <div className="h-4 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                    <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                    <div className="h-4 w-36 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                    <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                    <div className="h-4 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
                  </div>
                ))
              ) : paginatedActivity.length === 0 ? (
                <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
                  No transactions found
                </div>
              ) : (
                paginatedActivity.map((tx) => {
                  const pool = poolLookup.get(tx.lendingPool.toLowerCase());
                  if (!pool) return null;

                  const isCollateralTx = tx.type === "supply-collateral" || tx.type === "withdraw-collateral";
                  const decimals = isCollateralTx ? pool.collateralDecimals : pool.borrowDecimals;
                  const symbol = isCollateralTx ? pool.collateralSymbol : pool.borrowSymbol;
                  const price = isCollateralTx
                    ? Number(formatUnits(pool.collateralPrice, pool.collateralPriceDecimals))
                    : Number(formatUnits(pool.borrowPrice, pool.borrowPriceDecimals));
                  const amount = Number(formatUnits(BigInt(tx.amount), decimals));
                  const usd = amount * price;
                  const fmtUsd = usd >= 1_000_000
                    ? `$${(usd / 1_000_000).toFixed(2)}M`
                    : usd >= 1_000
                      ? `$${(usd / 1_000).toFixed(2)}k`
                      : `$${usd.toFixed(2)}`;
                  const fmtAmount = amount >= 1_000_000
                    ? `${(amount / 1_000_000).toFixed(2)}M`
                    : amount >= 1_000
                      ? `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      : amount.toFixed(2);

                  const date = new Date(tx.timestamp * 1000);
                  const dateStr =
                    date.getFullYear() +
                    "-" + String(date.getMonth() + 1).padStart(2, "0") +
                    "-" + String(date.getDate()).padStart(2, "0") +
                    " " + String(date.getHours()).padStart(2, "0") +
                    ":" + String(date.getMinutes()).padStart(2, "0") +
                    ":" + String(date.getSeconds()).padStart(2, "0");

                  const typeLabel =
                    tx.type === "deposit" ? "Deposit"
                    : tx.type === "withdraw" ? "Withdraw"
                    : tx.type === "borrow" ? "Borrow"
                    : tx.type === "repay" ? "Repay"
                    : tx.type === "supply-collateral" ? "Supply Collateral"
                    : "Withdraw Collateral";

                  return (
                    <div
                      key={tx.id}
                      className="activity-row grid grid-cols-[1.5fr_1.2fr_2fr_1.5fr_1.5fr] items-center px-6 py-4 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.03] transition-colors"
                    >
                      {/* Date */}
                      <span className="text-sm text-[var(--text-secondary)]">{dateStr}</span>

                      {/* Type */}
                      <span className="text-sm text-[var(--text-primary)]">{typeLabel}</span>

                      {/* Amount */}
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={symbol} color={getTokenColor(symbol)} size={20} />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {fmtAmount} {symbol}
                        </span>
                        {price > 0 && (
                          <span className="text-[10px] text-[var(--text-tertiary)] bg-white/[0.06] px-1.5 py-0.5 rounded">
                            {fmtUsd}
                          </span>
                        )}
                      </div>

                      {/* Pool */}
                      <div className="flex items-center gap-2">
                        <div className="relative w-9 h-5 flex-shrink-0">
                          <div className="absolute left-0 z-10">
                            <TokenIcon symbol={pool.collateralSymbol} color={getTokenColor(pool.collateralSymbol)} size={20} />
                          </div>
                          <div className="absolute left-3">
                            <TokenIcon symbol={pool.borrowSymbol} color={getTokenColor(pool.borrowSymbol)} size={20} />
                          </div>
                        </div>
                        <span className="text-sm text-[var(--text-secondary)]">
                          {pool.collateralSymbol}/{pool.borrowSymbol}
                        </span>
                      </div>

                      {/* Transaction */}
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          {shortenAddr(tx.txHash)}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                            <path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {filteredActivity.length > ACTIVITY_PER_PAGE && (
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                  disabled={activityPage <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M8.5 3.5L5 7l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="text-sm text-[var(--text-secondary)]">
                  {activityPage} of {activityTotalPages}
                </span>
                <button
                  onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                  disabled={activityPage >= activityTotalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M5.5 3.5L9 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
