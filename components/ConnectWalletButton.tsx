"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function ConnectWalletButton() {
  return (
    <ConnectButton
      label="Connect Wallet"
      accountStatus={{
        smallScreen: "avatar",
        largeScreen: "full",
      }}
      chainStatus={{
        smallScreen: "icon",
        largeScreen: "full",
      }}
      showBalance={{
        smallScreen: false,
        largeScreen: true,
      }}
    />
  );
}
