import { arbitrumSepolia } from "wagmi/chains";

export const CHAIN = arbitrumSepolia;

export const MULTICALL_ADDRESS = "0xe9a1adc452cd26cae2062d997a97a3800eaaeaa3" as const;

export const BASE_SEPOLIA_TOKENS = [
  { symbol: "USDC", address: "0x84338e71eef83b688d385f25d3345565bE5Bdb7d" as `0x${string}`, decimals: 6, color: "#2775CA" },
  { symbol: "USDT", address: "0xFE405cE04fC81C54A693405b169818F092443Ac5" as `0x${string}`, decimals: 6, color: "#50AF95" },
  { symbol: "WETH", address: "0x211Ee1C79c71CB3102619F4cc2AC9C2C2Fe88252" as `0x${string}`, decimals: 18, color: "#627EEA" },
  { symbol: "WBTC", address: "0xfc8E7181ad9Af4baf08f1582e41B1627B47A90fb" as `0x${string}`, decimals: 8, color: "#F7931A" },
] as const;