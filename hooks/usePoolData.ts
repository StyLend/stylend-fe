import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { tokenDataStreamAbi } from "@/lib/abis/token-data-stream-abi";
import { CHAIN } from "@/lib/contracts";

export interface PoolData {
  poolAddress: `0x${string}`;
  routerAddress: `0x${string}`;
  borrowTokenAddr: `0x${string}`;
  collateralTokenAddr: `0x${string}`;
  borrowSymbol: string;
  borrowName: string;
  borrowDecimals: number;
  collateralSymbol: string;
  collateralName: string;
  collateralDecimals: number;
  totalSupply: bigint;
  totalBorrow: bigint;
  liquidity: bigint;
  ltvRaw: bigint;
  ltv: number;
  borrowRate: bigint;
  borrowApy: number;
  supplyApy: number;
  borrowPrice: bigint;
  borrowPriceDecimals: number;
  collateralPrice: bigint;
  collateralPriceDecimals: number;
}

export function usePoolData(poolAddress: `0x${string}`) {
  const client = usePublicClient({ chainId: CHAIN.id });

  return useQuery<PoolData>({
    queryKey: ["poolData", poolAddress],
    queryFn: async () => {
      if (!client) throw new Error("No public client");

      // Step 1: get router address
      const routerAddress = await client.readContract({
        address: poolAddress,
        abi: lendingPoolAbi,
        functionName: "router",
      }) as `0x${string}`;

      // Step 2: pool data from router (multicall)
      const [borrowTokenAddr, collateralTokenAddr, totalSupply, totalBorrow, ltvRaw, factoryAddr] =
        await Promise.all([
          client.readContract({ address: routerAddress, abi: lendingPoolRouterAbi, functionName: "borrowToken" }),
          client.readContract({ address: routerAddress, abi: lendingPoolRouterAbi, functionName: "collateralToken" }),
          client.readContract({ address: routerAddress, abi: lendingPoolRouterAbi, functionName: "totalSupplyAssets" }),
          client.readContract({ address: routerAddress, abi: lendingPoolRouterAbi, functionName: "totalBorrowAssets" }),
          client.readContract({ address: routerAddress, abi: lendingPoolRouterAbi, functionName: "ltv" }),
          client.readContract({ address: routerAddress, abi: lendingPoolRouterAbi, functionName: "factory" }),
        ]) as [`0x${string}`, `0x${string}`, bigint, bigint, bigint, `0x${string}`];

      // Step 3: token info (parallel)
      const [borrowSymbol, borrowName, borrowDecimals, collateralSymbol, collateralName, collateralDecimals] =
        await Promise.all([
          client.readContract({ address: borrowTokenAddr, abi: mockErc20Abi, functionName: "symbol" }),
          client.readContract({ address: borrowTokenAddr, abi: mockErc20Abi, functionName: "name" }),
          client.readContract({ address: borrowTokenAddr, abi: mockErc20Abi, functionName: "decimals" }),
          client.readContract({ address: collateralTokenAddr, abi: mockErc20Abi, functionName: "symbol" }),
          client.readContract({ address: collateralTokenAddr, abi: mockErc20Abi, functionName: "name" }),
          client.readContract({ address: collateralTokenAddr, abi: mockErc20Abi, functionName: "decimals" }),
        ]) as [string, string, number, string, string, number];

      // Step 4: IRM + tokenDataStream from factory
      const [irmAddress, tokenDataStreamAddr] = await Promise.all([
        client.readContract({
          address: factoryAddr,
          abi: lendingPoolFactoryAbi,
          functionName: "interestRateModel",
        }),
        client.readContract({
          address: factoryAddr,
          abi: lendingPoolFactoryAbi,
          functionName: "tokenDataStream",
        }),
      ]) as [`0x${string}`, `0x${string}`];

      // Step 5: borrow rate + reserve factor from IRM
      let borrowRate = 0n;
      let reserveFactor = 0n;

      if (totalSupply > 0n && totalBorrow > 0n) {
        [borrowRate, reserveFactor] = await Promise.all([
          client.readContract({
            address: irmAddress,
            abi: interestRateModelAbi,
            functionName: "calculateBorrowRate",
            args: [routerAddress, totalSupply, totalBorrow],
          }),
          client.readContract({
            address: irmAddress,
            abi: interestRateModelAbi,
            functionName: "tokenReserveFactor",
            args: [routerAddress],
          }),
        ]) as [bigint, bigint];
      }

      // Step 6: Token prices from TokenDataStream
      const [borrowPriceRound, borrowPriceDec, collateralPriceRound, collateralPriceDec] =
        await Promise.all([
          client.readContract({ address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "latestRoundData", args: [borrowTokenAddr] }),
          client.readContract({ address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "decimals", args: [borrowTokenAddr] }),
          client.readContract({ address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "latestRoundData", args: [collateralTokenAddr] }),
          client.readContract({ address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "decimals", args: [collateralTokenAddr] }),
        ]) as [
          readonly [bigint, bigint, bigint, bigint, bigint], bigint,
          readonly [bigint, bigint, bigint, bigint, bigint], bigint,
        ];

      const ltv = Number(ltvRaw) / 1e16;
      const borrowApy = borrowRate ? Number(borrowRate) / 1e18 * 100 : 0;
      const liquidity = totalSupply - totalBorrow;

      // Supply APY = borrowRate * utilization * (1 - reserveFactor)
      const supplyApy = (() => {
        if (totalSupply === 0n || !borrowRate) return 0;
        const borrowRateNum = Number(borrowRate) / 1e18;
        const utilizationNum = Number(totalBorrow) / Number(totalSupply);
        const reserveFactorNum = reserveFactor > 0n ? Number(reserveFactor) / 1e18 : 0.1;
        return borrowRateNum * utilizationNum * (1 - reserveFactorNum) * 100;
      })();

      return {
        poolAddress,
        routerAddress,
        borrowTokenAddr,
        collateralTokenAddr,
        borrowSymbol,
        borrowName,
        borrowDecimals,
        collateralSymbol,
        collateralName,
        collateralDecimals,
        totalSupply,
        totalBorrow,
        liquidity,
        ltvRaw,
        ltv,
        borrowRate,
        borrowApy,
        supplyApy,
        borrowPrice: borrowPriceRound[1],
        borrowPriceDecimals: Number(borrowPriceDec),
        collateralPrice: collateralPriceRound[1],
        collateralPriceDecimals: Number(collateralPriceDec),
      };
    },
    enabled: !!client,
    staleTime: 0,
    refetchInterval: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
}
