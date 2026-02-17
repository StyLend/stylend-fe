import { arbitrumSepolia } from "wagmi/chains";

export const CHAIN = arbitrumSepolia;

export const LENDING_POOL_ADDRESS =
  "0x620e3C7FA714F3e7A929eDEB60D29c6fA9ceA996" as const;

export const LENDING_POOL_ADDRESSES: readonly `0x${string}`[] = [
  "0x620e3C7FA714F3e7A929eDEB60D29c6fA9ceA996",
  "0x1C1f7C86174023C9D53c9d6aBD76d117891a5738",
] as const;