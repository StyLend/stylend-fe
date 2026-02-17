import { arbitrumSepolia } from "wagmi/chains";

export const CHAIN = arbitrumSepolia;

export const LENDING_POOL_ADDRESSES: readonly `0x${string}`[] = [
  "0xa234207393c1e8345f7d8428f3f9cd3ccef18365",
  "0x76604928143775545b613499fad77dff0da5d601",
] as const;

export const MULTICALL_ADDRESS = "0xe9a1adc452cd26cae2062d997a97a3800eaaeaa3" as const;

export const BASE_SEPOLIA_CHAIN_ID = 84532;