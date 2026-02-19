import { useQuery } from "@tanstack/react-query";

const GRAPHQL_URL = "https://api.stylend.xyz/";

const POOL_TRANSACTIONS_QUERY = `
  query {
    supplyLiquidityEvents {
      items {
        amount
        blockNumber
        id
        lendingPool
        shares
        timestamp
        txHash
        user
      }
    }
    withdrawLiquidityEvents {
      items {
        amount
        blockNumber
        id
        lendingPool
        shares
        timestamp
        txHash
        user
      }
    }
  }
`;

export interface PoolTransaction {
  id: string;
  type: "deposit" | "withdraw";
  amount: string;
  shares: string;
  timestamp: number;
  txHash: string;
  user: string;
  lendingPool: string;
}

export type TxFilter = "all" | "deposit" | "withdraw";

export function usePoolTransactions(poolAddress: string | undefined) {
  return useQuery<PoolTransaction[]>({
    queryKey: ["poolTransactions", poolAddress],
    enabled: !!poolAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: POOL_TRANSACTIONS_QUERY }),
      });

      if (!res.ok) throw new Error("Failed to fetch transactions");

      const json = await res.json();
      const supplyItems = json?.data?.supplyLiquidityEvents?.items ?? [];
      const withdrawItems = json?.data?.withdrawLiquidityEvents?.items ?? [];

      const addr = poolAddress!.toLowerCase();

      const deposits: PoolTransaction[] = supplyItems
        .filter((e: { lendingPool: string }) => e.lendingPool.toLowerCase() === addr)
        .map((e: { id: string; amount: string; shares: string; timestamp: number; txHash: string; user: string; lendingPool: string }) => ({
          id: e.id,
          type: "deposit" as const,
          amount: e.amount,
          shares: e.shares,
          timestamp: e.timestamp,
          txHash: e.txHash,
          user: e.user,
          lendingPool: e.lendingPool,
        }));

      const withdrawals: PoolTransaction[] = withdrawItems
        .filter((e: { lendingPool: string }) => e.lendingPool.toLowerCase() === addr)
        .map((e: { id: string; amount: string; shares: string; timestamp: number; txHash: string; user: string; lendingPool: string }) => ({
          id: e.id,
          type: "withdraw" as const,
          amount: e.amount,
          shares: e.shares,
          timestamp: e.timestamp,
          txHash: e.txHash,
          user: e.user,
          lendingPool: e.lendingPool,
        }));

      return [...deposits, ...withdrawals].sort((a, b) => b.timestamp - a.timestamp);
    },
  });
}
