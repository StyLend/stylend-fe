import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import type { ChartDataPoint } from "./usePoolSnapshots";
import type { PoolData } from "./usePoolData";

const GRAPHQL_URL = "https://api.stylend.xyz/";

const ALL_SNAPSHOTS_QUERY = `
  query {
    poolSnapshots {
      items {
        availableLiquidity
        timestamp
        blockNumber
        borrowRate
        eventType
        id
        lendingPool
        router
        supplyAPR
        totalBorrowAssets
        totalCollateral
        totalSupplyAssets
        utilization
      }
    }
    supplyCollateralEvents {
      items {
        amount
        lendingPool
        positionAddress
        timestamp
        user
      }
    }
    withdrawCollateralEvents {
      items {
        amount
        lendingPool
        timestamp
        user
      }
    }
  }
`;

interface RawSnapshot {
  id: string;
  timestamp: number;
  blockNumber: number;
  lendingPool: string;
  router: string;
  totalSupplyAssets: string;
  totalBorrowAssets: string;
  totalCollateral: string;
  availableLiquidity: string;
  supplyAPR: string;
  borrowRate: string;
  utilization: string;
  eventType: string;
}

interface CollateralEvent {
  amount: string;
  lendingPool: string;
  timestamp: number;
  user: string;
}

export interface UserPoolPosition {
  pool: PoolData;
  depositAmount: bigint;
  depositUsd: number;
  borrowAmount: bigint;
  borrowUsd: number;
}

/** Info needed to map pool addresses to collateral token details */
export interface PoolCollateralInfo {
  poolAddress: string;    // lending pool address (matches events' lendingPool)
  routerAddress: string;  // router address (matches snapshots' router)
  collateralDecimals: number;
  collateralPrice: number; // already formatted: Number(formatUnits(price, priceDecimals))
}

interface PoolRatio {
  depositRatio: number;
  borrowRatio: number;
  decimals: number;
  collateralDecimals: number;
  price: number;
}

function formatDateSmart(ts: number, spanDays: number): string {
  const d = new Date(ts * 1000);
  if (spanDays <= 7) {
    return (
      d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    );
  }
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** Binary search: find the latest snapshot with timestamp <= target */
function findLatestBefore(
  snapshots: RawSnapshot[],
  timestamp: number,
): RawSnapshot | null {
  let lo = 0;
  let hi = snapshots.length - 1;
  let result: RawSnapshot | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].timestamp <= timestamp) {
      result = snapshots[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

interface AggregatedResult {
  depositChart: ChartDataPoint[];
  borrowChart: ChartDataPoint[];
  collateralChart: ChartDataPoint[];
}

/**
 * Fetches pool snapshots + collateral events for ALL pools the user has positions in.
 * - Deposit/borrow charts: estimated from pool snapshots using user's current share ratio.
 * - Collateral chart: built from actual supply/withdraw collateral events for exact history.
 */
export function useAggregatedSnapshots(
  deposits: UserPoolPosition[] | undefined,
  loans: UserPoolPosition[] | undefined,
  collateralInfos: PoolCollateralInfo[] | undefined,
  userAddress: string | undefined,
) {
  return useQuery<AggregatedResult>({
    queryKey: [
      "aggregatedSnapshots",
      deposits?.map((d) => `${d.pool.routerAddress}:${d.depositUsd.toFixed(2)}`).join(","),
      loans?.map((l) => `${l.pool.routerAddress}:${l.borrowUsd.toFixed(2)}`).join(","),
      collateralInfos?.map((c) => `${c.poolAddress}:${c.collateralPrice}`).join(","),
      userAddress,
    ],
    enabled:
      !!userAddress &&
      ((!!deposits && deposits.length > 0) ||
        (!!loans && loans.length > 0) ||
        (!!collateralInfos && collateralInfos.length > 0)),
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ALL_SNAPSHOTS_QUERY }),
      });

      if (!res.ok) throw new Error("Failed to fetch snapshots");

      const json = await res.json();
      const snapshotItems: RawSnapshot[] = json?.data?.poolSnapshots?.items ?? [];
      const supplyEvents: CollateralEvent[] = json?.data?.supplyCollateralEvents?.items ?? [];
      const withdrawEvents: CollateralEvent[] = json?.data?.withdrawCollateralEvents?.items ?? [];

      // ═══════════════════════════════════════════
      // DEPOSIT & BORROW CHARTS (ratio-based from pool snapshots)
      // ═══════════════════════════════════════════

      const poolRatios = new Map<string, PoolRatio>();

      for (const dep of deposits ?? []) {
        const addr = dep.pool.routerAddress.toLowerCase();
        const totalSupplyNum = Number(formatUnits(dep.pool.totalSupply, dep.pool.borrowDecimals));
        const userDepositNum = Number(formatUnits(dep.depositAmount, dep.pool.borrowDecimals));
        const depositRatio = totalSupplyNum > 0 ? userDepositNum / totalSupplyNum : 0;
        const price = Number(formatUnits(dep.pool.borrowPrice, dep.pool.borrowPriceDecimals));

        poolRatios.set(addr, {
          depositRatio,
          borrowRatio: 0,
          decimals: dep.pool.borrowDecimals,
          collateralDecimals: dep.pool.collateralDecimals,
          price,
        });
      }

      for (const loan of loans ?? []) {
        const addr = loan.pool.routerAddress.toLowerCase();
        const totalBorrowNum = Number(formatUnits(loan.pool.totalBorrow, loan.pool.borrowDecimals));
        const userBorrowNum = Number(formatUnits(loan.borrowAmount, loan.pool.borrowDecimals));
        const borrowRatio = totalBorrowNum > 0 ? userBorrowNum / totalBorrowNum : 0;
        const price = Number(formatUnits(loan.pool.borrowPrice, loan.pool.borrowPriceDecimals));

        const existing = poolRatios.get(addr);
        if (existing) {
          existing.borrowRatio = borrowRatio;
        } else {
          poolRatios.set(addr, {
            depositRatio: 0,
            borrowRatio,
            decimals: loan.pool.borrowDecimals,
            collateralDecimals: loan.pool.collateralDecimals,
            price,
          });
        }
      }

      // Group snapshots by pool
      const snapshotsByPool = new Map<string, RawSnapshot[]>();
      for (const s of snapshotItems) {
        const routerAddr = s.router.toLowerCase();
        const lpAddr = s.lendingPool.toLowerCase();
        const matchedAddr = poolRatios.has(routerAddr)
          ? routerAddr
          : poolRatios.has(lpAddr)
            ? lpAddr
            : null;
        if (!matchedAddr) continue;
        if (!snapshotsByPool.has(matchedAddr)) snapshotsByPool.set(matchedAddr, []);
        snapshotsByPool.get(matchedAddr)!.push(s);
      }

      for (const [, snaps] of snapshotsByPool) {
        snaps.sort((a, b) => a.timestamp - b.timestamp);
      }

      // Build deposit & borrow charts
      const snapshotTimestamps = new Set<number>();
      for (const [, snaps] of snapshotsByPool) {
        for (const s of snaps) snapshotTimestamps.add(s.timestamp);
      }
      const sortedSnapshotTs = Array.from(snapshotTimestamps).sort((a, b) => a - b);

      const depositChart: ChartDataPoint[] = [];
      const borrowChart: ChartDataPoint[] = [];

      if (sortedSnapshotTs.length > 0) {
        const spanDays =
          (sortedSnapshotTs[sortedSnapshotTs.length - 1] - sortedSnapshotTs[0]) / 86400;

        for (const ts of sortedSnapshotTs) {
          let totalUserDeposit = 0;
          let totalUserBorrow = 0;
          let weightedDepositApy = 0;
          let weightedBorrowRate = 0;

          for (const [addr, snaps] of snapshotsByPool) {
            const snap = findLatestBefore(snaps, ts);
            if (!snap) continue;

            const ratios = poolRatios.get(addr)!;
            const poolSupply = Number(
              formatUnits(BigInt(snap.totalSupplyAssets), ratios.decimals),
            );
            const poolBorrow = Number(
              formatUnits(BigInt(snap.totalBorrowAssets), ratios.decimals),
            );

            const userDeposit = poolSupply * ratios.depositRatio * ratios.price;
            const userBorrow = poolBorrow * ratios.borrowRatio * ratios.price;

            totalUserDeposit += userDeposit;
            totalUserBorrow += userBorrow;

            const apy = (Number(snap.supplyAPR) / 1e18) * 100;
            const bRate = (Number(snap.borrowRate) / 1e18) * 100;
            weightedDepositApy += apy * userDeposit;
            weightedBorrowRate += bRate * userBorrow;
          }

          const date = formatDateSmart(ts, spanDays);

          depositChart.push({
            timestamp: ts,
            date,
            totalDeposits: totalUserDeposit,
            totalBorrows: 0,
            totalCollateral: 0,
            supplyApy: totalUserDeposit > 0 ? weightedDepositApy / totalUserDeposit : 0,
            borrowRate: 0,
          });

          borrowChart.push({
            timestamp: ts,
            date,
            totalDeposits: 0,
            totalBorrows: totalUserBorrow,
            totalCollateral: 0,
            supplyApy: 0,
            borrowRate: totalUserBorrow > 0 ? weightedBorrowRate / totalUserBorrow : 0,
          });
        }
      }

      // ═══════════════════════════════════════════
      // COLLATERAL CHART (event-based, exact history)
      // ═══════════════════════════════════════════

      const collateralChart: ChartDataPoint[] = [];

      if (userAddress && collateralInfos && collateralInfos.length > 0) {
        const userAddr = userAddress.toLowerCase();

        // Map poolAddress (lendingPool) → collateral info
        const poolInfoMap = new Map<string, PoolCollateralInfo>();
        for (const info of collateralInfos) {
          poolInfoMap.set(info.poolAddress.toLowerCase(), info);
        }

        // Merge supply (+) and withdraw (-) events for this user, sorted by time
        interface TaggedEvent {
          timestamp: number;
          pool: string;
          amount: bigint;
          sign: 1 | -1;
        }

        const taggedEvents: TaggedEvent[] = [];

        for (const e of supplyEvents) {
          if (e.user.toLowerCase() !== userAddr) continue;
          const pool = e.lendingPool.toLowerCase();
          if (!poolInfoMap.has(pool)) continue;
          taggedEvents.push({
            timestamp: e.timestamp,
            pool,
            amount: BigInt(e.amount),
            sign: 1,
          });
        }

        for (const e of withdrawEvents) {
          if (e.user.toLowerCase() !== userAddr) continue;
          const pool = e.lendingPool.toLowerCase();
          if (!poolInfoMap.has(pool)) continue;
          taggedEvents.push({
            timestamp: e.timestamp,
            pool,
            amount: BigInt(e.amount),
            sign: -1,
          });
        }

        // Sort by timestamp
        taggedEvents.sort((a, b) => a.timestamp - b.timestamp);

        if (taggedEvents.length > 0) {
          // Running balance per pool (in raw token units as bigint)
          const balanceByPool = new Map<string, bigint>();

          const spanDays =
            (taggedEvents[taggedEvents.length - 1].timestamp - taggedEvents[0].timestamp) / 86400;

          for (const evt of taggedEvents) {
            const prev = balanceByPool.get(evt.pool) ?? 0n;
            const newBal = evt.sign === 1 ? prev + evt.amount : prev - evt.amount;
            balanceByPool.set(evt.pool, newBal < 0n ? 0n : newBal);

            // Calculate total collateral USD across all pools at this point
            let totalCollateralUsd = 0;
            for (const [pool, bal] of balanceByPool) {
              const info = poolInfoMap.get(pool)!;
              const tokenAmount = Number(formatUnits(bal, info.collateralDecimals));
              totalCollateralUsd += tokenAmount * info.collateralPrice;
            }

            collateralChart.push({
              timestamp: evt.timestamp,
              date: formatDateSmart(evt.timestamp, spanDays),
              totalDeposits: 0,
              totalBorrows: 0,
              totalCollateral: totalCollateralUsd,
              supplyApy: 0,
              borrowRate: 0,
            });
          }
        }
      }

      return { depositChart, borrowChart, collateralChart };
    },
  });
}
