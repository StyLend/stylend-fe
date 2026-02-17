import { arbitrumSepolia } from "wagmi/chains";

export const CHAIN = arbitrumSepolia;

export const LENDING_POOL_ADDRESSES: readonly `0x${string}`[] = [
  "0x126a3c7bf5b143e8cfd6cf1e1610f3cc021c10ca",
  "0x1C1f7C86174023C9D53c9d6aBD76d117891a5738",
] as const;

export const MULTICALL_ADDRESS = "0xe9a1adc452cd26cae2062d997a97a3800eaaeaa3" as const;

export const BASE_SEPOLIA_CHAIN_ID = 84532;