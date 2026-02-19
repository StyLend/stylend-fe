import { useQuery } from "@tanstack/react-query";

const GRAPHQL_URL = "https://api.stylend.xyz/";

const BORROW_TRANSACTIONS_QUERY = `
  query {
    borrowDebtEvents {
      items {
        amount
        blockNumber
        id
        lendingPool
        protocolFee
        shares
        timestamp
        txHash
        user
        userAmount
      }
    }
    repayByPositionEvents {
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
    supplyCollateralEvents {
      items {
        amount
        blockNumber
        lendingPool
        id
        positionAddress
        timestamp
        txHash
        user
      }
    }
    withdrawCollateralEvents {
      items {
        amount
        blockNumber
        id
        lendingPool
        timestamp
        txHash
        user
      }
    }
  }
`;

export interface BorrowTransaction {
  id: string;
  type: "borrow" | "repay" | "supply-collateral" | "withdraw-collateral";
  amount: string;
  timestamp: number;
  txHash: string;
  user: string;
  lendingPool: string;
}

export type BorrowTxFilter = "all" | "borrow" | "repay" | "supply-collateral" | "withdraw-collateral";

export function useBorrowTransactions(poolAddress: string | undefined) {
  return useQuery<BorrowTransaction[]>({
    queryKey: ["borrowTransactions", poolAddress],
    enabled: !!poolAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: BORROW_TRANSACTIONS_QUERY }),
      });

      if (!res.ok) throw new Error("Failed to fetch borrow transactions");

      const json = await res.json();
      const borrowItems = json?.data?.borrowDebtEvents?.items ?? [];
      const repayItems = json?.data?.repayByPositionEvents?.items ?? [];
      const supplyColItems = json?.data?.supplyCollateralEvents?.items ?? [];
      const withdrawColItems = json?.data?.withdrawCollateralEvents?.items ?? [];

      const addr = poolAddress!.toLowerCase();

      const borrows: BorrowTransaction[] = borrowItems
        .filter((e: { lendingPool: string }) => e.lendingPool.toLowerCase() === addr)
        .map((e: { id: string; userAmount: string; timestamp: number; txHash: string; user: string; lendingPool: string }) => ({
          id: e.id,
          type: "borrow" as const,
          amount: e.userAmount,
          timestamp: e.timestamp,
          txHash: e.txHash,
          user: e.user,
          lendingPool: e.lendingPool,
        }));

      const repays: BorrowTransaction[] = repayItems
        .filter((e: { lendingPool: string }) => e.lendingPool.toLowerCase() === addr)
        .map((e: { id: string; amount: string; timestamp: number; txHash: string; user: string; lendingPool: string }) => ({
          id: e.id,
          type: "repay" as const,
          amount: e.amount,
          timestamp: e.timestamp,
          txHash: e.txHash,
          user: e.user,
          lendingPool: e.lendingPool,
        }));

      const supplyCollaterals: BorrowTransaction[] = supplyColItems
        .filter((e: { lendingPool: string }) => e.lendingPool.toLowerCase() === addr)
        .map((e: { id: string; amount: string; timestamp: number; txHash: string; user: string; lendingPool: string }) => ({
          id: e.id,
          type: "supply-collateral" as const,
          amount: e.amount,
          timestamp: e.timestamp,
          txHash: e.txHash,
          user: e.user,
          lendingPool: e.lendingPool,
        }));

      const withdrawCollaterals: BorrowTransaction[] = withdrawColItems
        .filter((e: { lendingPool: string }) => e.lendingPool.toLowerCase() === addr)
        .map((e: { id: string; amount: string; timestamp: number; txHash: string; user: string; lendingPool: string }) => ({
          id: e.id,
          type: "withdraw-collateral" as const,
          amount: e.amount,
          timestamp: e.timestamp,
          txHash: e.txHash,
          user: e.user,
          lendingPool: e.lendingPool,
        }));

      return [...borrows, ...repays, ...supplyCollaterals, ...withdrawCollaterals]
        .sort((a, b) => b.timestamp - a.timestamp);
    },
  });
}
