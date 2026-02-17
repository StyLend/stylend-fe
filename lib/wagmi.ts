import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumSepolia, baseSepolia } from "wagmi/chains";
import type { Chain } from "@rainbow-me/rainbowkit";

const arbitrumSepoliaCustom: Chain = {
  ...arbitrumSepolia,
  iconUrl: "/chains/arbitrum-logo.png",
  iconBackground: "#1B1F36",
};

const baseSepoliaCustom: Chain = {
  ...baseSepolia,
  iconUrl: "/chains/base-logo.png",
  iconBackground: "#0052FF",
};

export const config = getDefaultConfig({
  appName: "Stylend",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [arbitrumSepoliaCustom, baseSepoliaCustom],
  ssr: true,
  transports: {
    [arbitrumSepolia.id]: http("https://arbitrum-sepolia-rpc.publicnode.com"),
    [baseSepolia.id]: http("https://base-sepolia.drpc.org"),
  },
});
