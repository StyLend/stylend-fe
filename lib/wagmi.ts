import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import type { Chain } from "@rainbow-me/rainbowkit";

const arbitrumSepoliaCustom: Chain = {
  ...arbitrumSepolia,
  iconUrl: "/chains/arbitrum-logo.png",
  iconBackground: "#1B1F36",
};

export const config = getDefaultConfig({
  appName: "Stylend",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [arbitrumSepoliaCustom],
  ssr: true,
  transports: {
    [arbitrumSepolia.id]: http("https://arbitrum-sepolia-rpc.publicnode.com"),
  },
});
