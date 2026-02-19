import { useQuery } from "@tanstack/react-query";

const GRAPHQL_URL = "https://api.stylend.xyz/";

const USER_ACTIVITY_QUERY = `
  query {
    supplyLiquidityEvents {
      items {
        id
        amount
        shares
        timestamp
        txHash
        user
        lendingPool
      }
    }
    withdrawLiquidityEvents {
      items {
        id
        amount
        shares
        timestamp
        txHash
        user
        lendingPool
      }
    }
    borrowDebtEvents {
      items {
        id
        amount
        userAmount
        shares
        timestamp
        txHash
        user
        lendingPool
      }
    }
    repayByPositionEvents {
      items {
        id
        amount
        shares
        timestamp
        txHash
        user
        lendingPool
      }
    }
    supplyCollateralEvents {
      items {
        id
        amount
        timestamp
        txHash
        user
        lendingPool
      }
    }
    withdrawCollateralEvents {
      items {
        id
        amount
        timestamp
        txHash
        user
        lendingPool
      }
    }
  }
`;

export type ActivityType =
  | "deposit"
  | "withdraw"
  | "borrow"
  | "repay"
  | "supply-collateral"
  | "withdraw-collateral";

export type ActivityFilter = "all" | ActivityType;

export interface UserActivityTransaction {
  id: string;
  type: ActivityType;
  amount: string;
  timestamp: number;
  txHash: string;
  user: string;
  lendingPool: string;
}

export function useUserActivity(userAddress: string | undefined) {
  return useQuery<UserActivityTransaction[]>({
    queryKey: ["userActivity", userAddress],
    enabled: !!userAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: USER_ACTIVITY_QUERY }),
      });

      if (!res.ok) throw new Error("Failed to fetch user activity");

      const json = await res.json();
      const addr = userAddress!.toLowerCase();

      const mapEvents = <T extends { id: string; amount: string; timestamp: number; txHash: string; user: string; lendingPool: string }>(
        items: T[],
        type: ActivityType,
        amountField: keyof T = "amount" as keyof T,
      ): UserActivityTransaction[] =>
        items
          .filter((e) => e.user.toLowerCase() === addr)
          .map((e) => ({
            id: e.id,
            type,
            amount: String(e[amountField]),
            timestamp: e.timestamp,
            txHash: e.txHash,
            user: e.user,
            lendingPool: e.lendingPool,
          }));

      const deposits = mapEvents(json?.data?.supplyLiquidityEvents?.items ?? [], "deposit");
      const withdrawals = mapEvents(json?.data?.withdrawLiquidityEvents?.items ?? [], "withdraw");
      const borrows = mapEvents(json?.data?.borrowDebtEvents?.items ?? [], "borrow", "userAmount" as never);
      const repays = mapEvents(json?.data?.repayByPositionEvents?.items ?? [], "repay");
      const supplyCollaterals = mapEvents(json?.data?.supplyCollateralEvents?.items ?? [], "supply-collateral");
      const withdrawCollaterals = mapEvents(json?.data?.withdrawCollateralEvents?.items ?? [], "withdraw-collateral");

      return [
        ...deposits,
        ...withdrawals,
        ...borrows,
        ...repays,
        ...supplyCollaterals,
        ...withdrawCollaterals,
      ].sort((a, b) => b.timestamp - a.timestamp);
    },
  });
}
