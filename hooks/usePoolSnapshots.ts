import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";

const GRAPHQL_URL = "https://api.stylend.xyz/";

const POOL_SNAPSHOTS_QUERY = `
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

export interface ChartDataPoint {
  timestamp: number;
  date: string;
  totalDeposits: number;
  totalBorrows: number;
  totalCollateral: number;
  supplyApy: number;
  borrowRate: number;
}

function formatDateSmart(ts: number, spanDays: number): string {
  const d = new Date(ts * 1000);
  if (spanDays <= 7) {
    // Short range: show "Feb 18 14:30"
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function usePoolSnapshots(
  routerAddress: string | undefined,
  borrowDecimals: number,
  collateralDecimals: number,
  ready: boolean,
) {
  return useQuery<ChartDataPoint[]>({
    queryKey: ["poolSnapshots", routerAddress, borrowDecimals, collateralDecimals],
    enabled: !!routerAddress && ready,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: POOL_SNAPSHOTS_QUERY }),
      });

      if (!res.ok) throw new Error("Failed to fetch pool snapshots");

      const json = await res.json();
      const items: RawSnapshot[] = json?.data?.poolSnapshots?.items ?? [];

      const addr = routerAddress!.toLowerCase();
      const filtered = items.filter(
        (s) =>
          s.lendingPool.toLowerCase() === addr ||
          s.router.toLowerCase() === addr,
      );

      filtered.sort((a, b) => a.timestamp - b.timestamp);

      // Calculate time span to decide date format
      const spanDays = filtered.length >= 2
        ? (filtered[filtered.length - 1].timestamp - filtered[0].timestamp) / 86400
        : 0;

      return filtered.map((s) => ({
        timestamp: s.timestamp,
        date: formatDateSmart(s.timestamp, spanDays),
        totalDeposits: Number(formatUnits(BigInt(s.totalSupplyAssets), borrowDecimals)),
        totalBorrows: Number(formatUnits(BigInt(s.totalBorrowAssets), borrowDecimals)),
        totalCollateral: Number(formatUnits(BigInt(s.totalCollateral), collateralDecimals)),
        supplyApy: Number(s.supplyAPR) / 1e18 * 100,
        borrowRate: Number(s.borrowRate) / 1e18 * 100,
      }));
    },
  });
}
