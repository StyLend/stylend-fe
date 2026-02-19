import { useQuery } from "@tanstack/react-query";

const GRAPHQL_URL = "https://api.stylend.xyz/";

const LENDING_POOLS_QUERY = `
  query {
    lendingPools {
      items {
        id
        router
        borrowToken
        collateralToken
        sharesToken
        ltv
        liquidationThreshold
        liquidationBonus
        baseRate
        rateAtOptimal
        optimalUtilization
        maxUtilization
        maxRate
        totalCollateral
        supplyLiquidity
        lastSnapshotBorrow
        lastSnapshotCollateral
        lastSnapshotSupply
        createdAtTimestamp
        owner
      }
    }
  }
`;

export interface IndexedLendingPool {
  id: `0x${string}`;
  router: `0x${string}`;
  borrowToken: `0x${string}`;
  collateralToken: `0x${string}`;
  sharesToken: `0x${string}`;
  ltv: string;
  liquidationThreshold: string;
  liquidationBonus: string;
  baseRate: string;
  rateAtOptimal: string;
  optimalUtilization: string;
  maxUtilization: string;
  maxRate: string;
  totalCollateral: string;
  supplyLiquidity: string;
  lastSnapshotBorrow: string;
  lastSnapshotCollateral: string;
  lastSnapshotSupply: string;
  createdAtTimestamp: number;
  owner: string;
}

export function useLendingPools() {
  return useQuery<`0x${string}`[]>({
    queryKey: ["lendingPoolAddresses"],
    queryFn: async () => {
      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: LENDING_POOLS_QUERY }),
      });
      const json = await res.json();
      const items: IndexedLendingPool[] = json?.data?.lendingPools?.items ?? [];
      return items.map((p) => p.id.toLowerCase() as `0x${string}`);
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
