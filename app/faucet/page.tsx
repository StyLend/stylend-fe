"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { gsap } from "@/hooks/useGsap";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, type Address } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import TokenIcon from "@/components/TokenIcon";

const FAUCET_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x5602a3f9b8a935df32871bb1c6289f24620233f7" as Address,
    decimals: 6,
    mintAmount: "1000",
    color: "#2775CA",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x21483bcde6e19fdb5acc1375c443ebb17147a69a" as Address,
    decimals: 6,
    mintAmount: "1000",
    color: "#50AF95",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x48b3f901d040796f9cda37469fc5436fca711366" as Address,
    decimals: 18,
    mintAmount: "1",
    color: "#627EEA",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    address: "0xacbc1ce1908b9434222e60d6cfed9e011a386220" as Address,
    decimals: 8,
    mintAmount: "0.1",
    color: "#F7931A",
  },
];

export default function FaucetPage() {
  const cardRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const { address, isConnected, chain, status } = useAccount();
  const [mintingToken, setMintingToken] = useState<string | null>(null);
  const isLoading = status === "connecting" || status === "reconnecting";

  const { data: hash, writeContract, isPending, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Read balances for all tokens
  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: FAUCET_TOKENS.map((token) => ({
      address: token.address,
      abi: mockErc20Abi,
      functionName: "balanceOf",
      args: [address!],
      chainId: arbitrumSepolia.id,
    })),
    query: {
      enabled: isConnected && !!address,
    },
  });

  // Refetch balances after successful mint
  useEffect(() => {
    if (isSuccess) {
      refetchBalances();
      setMintingToken(null);
      reset();
    }
  }, [isSuccess, refetchBalances, reset]);

  // GSAP mount animations
  useEffect(() => {
    if (cardRef.current) {
      gsap.set(cardRef.current, { opacity: 0, y: 20 });
      gsap.to(cardRef.current, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", delay: 0.2 });
    }

    const rows = rowRefs.current.filter(Boolean);
    if (rows.length > 0) {
      gsap.set(rows, { opacity: 0, x: -15 });
      gsap.to(rows, {
        opacity: 1,
        x: 0,
        duration: 0.4,
        stagger: 0.08,
        ease: "power3.out",
        delay: 0.4,
      });
    }
  }, []);

  const handleMint = (token: (typeof FAUCET_TOKENS)[number]) => {
    if (!address) return;
    setMintingToken(token.symbol);
    writeContract({
      address: token.address,
      abi: mockErc20Abi,
      functionName: "mint",
      args: [address, parseUnits(token.mintAmount, token.decimals)],
      chainId: arbitrumSepolia.id,
    });
  };

  const getBalance = (index: number, decimals: number): string => {
    if (!balances || !balances[index] || balances[index].status !== "success") return "—";
    return formatUnits(balances[index].result as bigint, decimals);
  };

  const isWrongNetwork = isConnected && chain?.id !== arbitrumSepolia.id;
  const isBusy = isPending || isConfirming;

  return (
    <div className="space-y-6">
      <div ref={cardRef} className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">

        {/* Loading skeleton */}
        {isLoading && (
          <div className="px-6 py-10">
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-20 rounded bg-[var(--bg-tertiary)]" />
                    <div className="h-3 w-28 rounded bg-[var(--bg-tertiary)]" />
                  </div>
                  <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)]" />
                  <div className="h-4 w-20 rounded bg-[var(--bg-tertiary)]" />
                  <div className="h-9 w-[100px] rounded-lg bg-[var(--bg-tertiary)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Not connected state */}
        {!isLoading && !isConnected && (
          <div className="px-6 py-14 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-400">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">Please connect your wallet to claim faucet tokens.</p>
              <ConnectButton />
            </div>
          </div>
        )}

        {/* Wrong network warning */}
        {!isLoading && isWrongNetwork && (
          <div className="px-6 py-4 bg-yellow-500/10 border-b border-yellow-500/20">
            <p className="text-sm text-yellow-400 text-center">
              Please switch to Arbitrum Sepolia to claim faucet tokens.
            </p>
          </div>
        )}

        {/* Token table */}
        {!isLoading && isConnected && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[25%]" />
                <col className="w-[25%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider px-6 py-3">Token</th>
                  <th className="text-center text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider px-6 py-3">Balance</th>
                  <th className="text-center text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider px-6 py-3">Mint Amount</th>
                  <th className="text-center text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {FAUCET_TOKENS.map((token, index) => (
                  <tr
                    key={token.symbol}
                    ref={(el) => { rowRefs.current[index] = el; }}
                    className="border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.05] transition-colors"
                  >
                    {/* Token */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <TokenIcon symbol={token.symbol} color={token.color} size={32} />
                        <div>
                          <div className="text-sm font-medium text-[var(--text-primary)]">{token.symbol}</div>
                          <div className="text-xs text-[var(--text-tertiary)]">{token.name}</div>
                        </div>
                      </div>
                    </td>

                    {/* Balance */}
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm text-[var(--text-secondary)]">
                        {getBalance(index, token.decimals)}
                      </span>
                    </td>

                    {/* Mint Amount */}
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm text-[var(--text-secondary)]">
                        {token.mintAmount} {token.symbol}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleMint(token)}
                        disabled={isBusy || isWrongNetwork}
                        className="inline-flex items-center justify-center min-w-[100px] px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--bg-primary)] text-sm font-semibold transition-colors cursor-pointer"
                      >
                        {isBusy && mintingToken === token.symbol
                          ? isConfirming
                            ? "Confirming..."
                            : "Minting..."
                          : "Claim"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
