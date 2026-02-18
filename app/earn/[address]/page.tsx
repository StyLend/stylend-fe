"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { CHAIN } from "@/lib/contracts";
import { gsap } from "@/hooks/useGsap";

const TOKEN_COLORS: Record<string, string> = {
  ETH: "#627eea", WETH: "#627eea", WBTC: "#f7931a", USDC: "#2775ca",
  USDT: "#26a17b", DAI: "#f5ac37", ARB: "#28a0f0", LINK: "#2a5ada",
};

function getTokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol.toUpperCase()] ?? "#6366f1";
}

function fmt(value: bigint, decimals: number): string {
  const num = Number(formatUnits(value, decimals));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  if (num > 0) return num.toFixed(6);
  return "0.00";
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded bg-[var(--bg-tertiary)] animate-pulse ${className ?? ""}`} />;
}

export default function EarnDetailPage() {
  const { address: poolAddress } = useParams<{ address: string }>();
  const lendingPoolAddr = poolAddress as `0x${string}`;

  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [supplyAmount, setSupplyAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [txStep, setTxStep] = useState<"idle" | "approving" | "supplying" | "success" | "error">("idle");
  const [wTxStep, setWTxStep] = useState<"idle" | "approving" | "withdrawing" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [wErrorMsg, setWErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "position">("overview");
  const [sidebarTab, setSidebarTab] = useState<"deposit" | "withdraw">("deposit");

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // ── Contract reads ──

  const { data: routerAddress } = useReadContract({
    address: lendingPoolAddr,
    abi: lendingPoolAbi,
    functionName: "router",
    chainId: CHAIN.id,
  });

  const { data: routerData, refetch: refetchRouter } = useReadContracts({
    contracts: [
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "borrowToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "collateralToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalSupplyAssets", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalBorrowAssets", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "sharesToken", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "ltv", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "factory", chainId: CHAIN.id },
    ],
    query: { enabled: !!routerAddress, refetchInterval: 5_000 },
  });

  const borrowTokenAddr = routerData?.[0]?.result as `0x${string}` | undefined;
  const collateralTokenAddr = routerData?.[1]?.result as `0x${string}` | undefined;
  const totalSupplyAssets = routerData?.[2]?.result as bigint | undefined;
  const totalBorrowAssets = routerData?.[3]?.result as bigint | undefined;
  const sharesTokenAddr = routerData?.[4]?.result as `0x${string}` | undefined;
  const ltvRaw = routerData?.[5]?.result as bigint | undefined;
  const factoryAddr = routerData?.[6]?.result as `0x${string}` | undefined;

  // Token info
  const { data: borrowInfo } = useReadContracts({
    contracts: [
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "symbol", chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "name", chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "decimals", chainId: CHAIN.id },
    ],
    query: { enabled: !!borrowTokenAddr },
  });

  const { data: collateralInfo } = useReadContracts({
    contracts: [
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "symbol", chainId: CHAIN.id },
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "name", chainId: CHAIN.id },
    ],
    query: { enabled: !!collateralTokenAddr },
  });

  // IRM address from factory
  const { data: irmAddress } = useReadContract({
    address: factoryAddr,
    abi: lendingPoolFactoryAbi,
    functionName: "interestRateModel",
    chainId: CHAIN.id,
    query: { enabled: !!factoryAddr },
  });

  // Borrow rate + reserve factor from IRM
  const totalSupply = totalSupplyAssets ?? 0n;
  const totalBorrow = totalBorrowAssets ?? 0n;

  const { data: irmData } = useReadContracts({
    contracts: [
      { address: irmAddress as `0x${string}`, abi: interestRateModelAbi, functionName: "calculateBorrowRate", args: [routerAddress!, totalSupply, totalBorrow], chainId: CHAIN.id },
      { address: irmAddress as `0x${string}`, abi: interestRateModelAbi, functionName: "tokenReserveFactor", args: [routerAddress!], chainId: CHAIN.id },
    ],
    query: { enabled: !!irmAddress && !!routerAddress && totalSupply > 0n && totalBorrow > 0n },
  });

  const borrowRate = irmData?.[0]?.result as bigint | undefined;
  const reserveFactor = irmData?.[1]?.result as bigint | undefined;

  const borrowSymbol = (borrowInfo?.[0]?.result as string) ?? "";
  const borrowName = (borrowInfo?.[1]?.result as string) ?? "";
  const borrowDecimals = (borrowInfo?.[2]?.result as number) ?? 18;
  const collateralSymbol = (collateralInfo?.[0]?.result as string) ?? "";
  const collateralName = (collateralInfo?.[1]?.result as string) ?? "";
  const isLoading = !borrowSymbol;

  // User balances
  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "balanceOf", args: [userAddress!], chainId: CHAIN.id },
      { address: sharesTokenAddr, abi: mockErc20Abi, functionName: "balanceOf", args: [userAddress!], chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "allowance", args: [userAddress!, lendingPoolAddr], chainId: CHAIN.id },
      { address: sharesTokenAddr, abi: mockErc20Abi, functionName: "allowance", args: [userAddress!, lendingPoolAddr], chainId: CHAIN.id },
      { address: sharesTokenAddr, abi: mockErc20Abi, functionName: "totalSupply", chainId: CHAIN.id },
    ],
    query: { enabled: !!borrowTokenAddr && !!sharesTokenAddr && !!userAddress, refetchInterval: 5_000 },
  });

  const walletBalance = (userData?.[0]?.result as bigint) ?? 0n;
  const sharesBalance = (userData?.[1]?.result as bigint) ?? 0n;
  const allowance = (userData?.[2]?.result as bigint) ?? 0n;
  const sharesAllowance = (userData?.[3]?.result as bigint) ?? 0n;
  const totalSharesSupply = (userData?.[4]?.result as bigint) ?? 0n;

  // Computed
  const utilization =
    totalSupplyAssets && totalSupplyAssets > 0n
      ? Number((totalBorrowAssets ?? 0n) * 10000n / totalSupplyAssets) / 100
      : 0;
  const liquidity =
    totalSupplyAssets !== undefined && totalBorrowAssets !== undefined
      ? totalSupplyAssets - totalBorrowAssets
      : undefined;
  const ltv = ltvRaw ? Number(ltvRaw) / 1e16 : 0;

  // Supply APY = borrowRate * utilization * (1 - reserveFactor)
  const supplyApy = (() => {
    if (!totalSupplyAssets || totalSupplyAssets === 0n || borrowRate === undefined) return 0;
    const borrowRateNum = Number(borrowRate) / 1e18;
    const utilizationNum = Number(totalBorrowAssets ?? 0n) / Number(totalSupplyAssets);
    const reserveFactorNum = reserveFactor && reserveFactor > 0n
      ? Number(reserveFactor) / 1e18
      : 0.1;
    return borrowRateNum * utilizationNum * (1 - reserveFactorNum) * 100;
  })();

  // ── Write hooks ──
  const { writeContract: writeApprove, data: approveTxHash, reset: resetApprove } = useWriteContract();
  const { writeContract: writeSupply, data: supplyTxHash, reset: resetSupply } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: supplyConfirmed } = useWaitForTransactionReceipt({ hash: supplyTxHash });

  const doSupplyTx = useCallback(() => {
    if (!userAddress) return;
    const amount = parseUnits(supplyAmount, borrowDecimals);
    setTxStep("supplying");
    writeSupply(
      {
        address: lendingPoolAddr,
        abi: lendingPoolAbi,
        functionName: "supplyLiquidity",
        args: [userAddress, amount],
        chainId: CHAIN.id,
      },
      {
        onError: (err) => {
          setTxStep("error");
          setErrorMsg(err.message.split("\n")[0]);
        },
      }
    );
  }, [userAddress, supplyAmount, borrowDecimals, lendingPoolAddr, writeSupply]);

  useEffect(() => {
    if (approveConfirmed && txStep === "approving") doSupplyTx();
  }, [approveConfirmed, txStep, doSupplyTx]);

  useEffect(() => {
    if (supplyConfirmed && txStep === "supplying") {
      setTxStep("success");
      setSupplyAmount("");
      refetchRouter();
      refetchUser();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
    }
  }, [supplyConfirmed, txStep, refetchRouter, refetchUser, queryClient]);

  const handleSupply = () => {
    if (!userAddress || !borrowTokenAddr || !supplyAmount) return;
    setErrorMsg("");
    const amount = parseUnits(supplyAmount, borrowDecimals);
    if (amount <= 0n) return;
    if (amount > walletBalance) {
      setErrorMsg("Insufficient balance");
      return;
    }
    if (allowance < amount) {
      setTxStep("approving");
      writeApprove(
        {
          address: borrowTokenAddr,
          abi: mockErc20Abi,
          functionName: "approve",
          args: [lendingPoolAddr, maxUint256],
          chainId: CHAIN.id,
        },
        {
          onError: (err) => {
            setTxStep("error");
            setErrorMsg(err.message.split("\n")[0]);
          },
        }
      );
    } else {
      doSupplyTx();
    }
  };

  const resetTx = () => {
    setTxStep("idle");
    setErrorMsg("");
    resetApprove();
    resetSupply();
  };

  // ── Withdraw hooks ──
  const { writeContract: writeWApprove, data: wApproveTxHash, reset: resetWApprove } = useWriteContract();
  const { writeContract: writeWithdraw, data: withdrawTxHash, reset: resetWithdraw } = useWriteContract();
  const { isSuccess: wApproveConfirmed } = useWaitForTransactionReceipt({ hash: wApproveTxHash });
  const { isSuccess: withdrawConfirmed } = useWaitForTransactionReceipt({ hash: withdrawTxHash });

  // Convert shares to estimated underlying tokens
  const sharesToUnderlying = (shares: bigint): bigint => {
    if (totalSharesSupply === 0n || totalSupply === 0n) return 0n;
    return (shares * totalSupply) / totalSharesSupply;
  };

  const doWithdrawTx = useCallback(() => {
    if (!userAddress || !withdrawShares) return;
    const shares = parseUnits(withdrawShares, 18);
    setWTxStep("withdrawing");
    writeWithdraw(
      {
        address: lendingPoolAddr,
        abi: lendingPoolAbi,
        functionName: "d",
        args: [shares],
        chainId: CHAIN.id,
      },
      {
        onError: (err) => {
          setWTxStep("error");
          setWErrorMsg(err.message.split("\n")[0]);
        },
      }
    );
  }, [userAddress, withdrawShares, lendingPoolAddr, writeWithdraw]);

  useEffect(() => {
    if (wApproveConfirmed && wTxStep === "approving") doWithdrawTx();
  }, [wApproveConfirmed, wTxStep, doWithdrawTx]);

  useEffect(() => {
    if (withdrawConfirmed && wTxStep === "withdrawing") {
      setWTxStep("success");
      setWithdrawShares("");
      refetchRouter();
      refetchUser();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
    }
  }, [withdrawConfirmed, wTxStep, refetchRouter, refetchUser, queryClient]);

  const handleWithdraw = () => {
    if (!userAddress || !sharesTokenAddr || !withdrawShares) return;
    setWErrorMsg("");
    const shares = parseUnits(withdrawShares, 18);
    if (shares <= 0n) return;
    if (shares > sharesBalance) {
      setWErrorMsg("Insufficient shares");
      return;
    }
    if (sharesAllowance < shares) {
      setWTxStep("approving");
      writeWApprove(
        {
          address: sharesTokenAddr,
          abi: mockErc20Abi,
          functionName: "approve",
          args: [lendingPoolAddr, maxUint256],
          chainId: CHAIN.id,
        },
        {
          onError: (err) => {
            setWTxStep("error");
            setWErrorMsg(err.message.split("\n")[0]);
          },
        }
      );
    } else {
      doWithdrawTx();
    }
  };

  const resetWTx = () => {
    setWTxStep("idle");
    setWErrorMsg("");
    resetWApprove();
    resetWithdraw();
  };

  // GSAP — useLayoutEffect runs BEFORE paint, so StrictMode double-mount is invisible
  useLayoutEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    if (leftRef.current) {
      gsap.set(leftRef.current, { opacity: 0, y: 25 });
      tl.to(leftRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
    }
    if (rightRef.current) {
      gsap.set(rightRef.current, { opacity: 0, y: 25 });
      tl.to(rightRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.3");
    }

    return () => { tl.kill(); };
  }, []);

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/earn"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Earn
      </Link>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-[var(--border)]">
        {(["overview", "position"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-medium capitalize transition-colors cursor-pointer ${
              activeTab === tab
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab === "position" ? "Your Position" : tab}
          </button>
        ))}
      </div>

      {/* Main content: Left overview + Right deposit sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* ──── Left side: Pool overview ──── */}
        <div ref={leftRef} className="space-y-6">
          {activeTab === "overview" ? (
            <>
              {/* Total Deposits card */}
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
                <div className="text-xs text-[var(--text-tertiary)] mb-1">
                  Total Deposits {borrowSymbol ? `(${borrowSymbol})` : ""}
                </div>
                {isLoading ? (
                  <Skeleton className="h-9 w-48" />
                ) : (
                  <div className="text-3xl font-bold text-[var(--text-primary)]">
                    {totalSupplyAssets !== undefined ? fmt(totalSupplyAssets, borrowDecimals) : "0.00"}
                    <span className="text-lg font-normal text-[var(--text-tertiary)] ml-2">{borrowSymbol}</span>
                  </div>
                )}
              </div>

              {/* Pool stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  ))
                ) : (
                  <>
                    <StatCard label="Total Borrowed" value={totalBorrowAssets !== undefined ? `${fmt(totalBorrowAssets, borrowDecimals)} ${borrowSymbol}` : "—"} />
                    <StatCard label="Available Liquidity" value={liquidity !== undefined ? `${fmt(liquidity, borrowDecimals)} ${borrowSymbol}` : "—"} />
                    <StatCard
                      label="APY"
                      value={`${supplyApy.toFixed(2)}%`}
                      accent
                    />
                    <StatCard label="LTV" value={`${ltv.toFixed(0)}%`} accent />
                  </>
                )}
              </div>

              {/* Pool details */}
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pool Details</h3>

                {isLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <DetailRow label="Liquidity Token">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={20} />
                        <span className="text-sm text-[var(--text-primary)]">{borrowSymbol}</span>
                      </div>
                    </DetailRow>

                    <DetailRow label="Collateral Token">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={20} />
                        <span className="text-sm text-[var(--text-primary)]">{collateralSymbol}</span>
                      </div>
                    </DetailRow>

                    <DetailRow label="Pool Address">
                      <span className="text-sm font-mono text-[var(--text-secondary)]">{shortenAddr(lendingPoolAddr)}</span>
                    </DetailRow>

                    {routerAddress && (
                      <DetailRow label="Router Address">
                        <span className="text-sm font-mono text-[var(--text-secondary)]">{shortenAddr(routerAddress)}</span>
                      </DetailRow>
                    )}

                  </div>
                )}
              </div>
            </>
          ) : (
            /* Position tab */
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6">
              {!isConnected ? (
                <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
                  Connect your wallet to view your position.
                </div>
              ) : isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-5 w-32" />
                  <div className="bg-[var(--bg-secondary)] rounded-xl p-4 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Your Position</h3>
                  <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                    <div className="text-xs text-[var(--text-tertiary)] mb-2">Deposited</div>
                    <div className="flex items-center gap-2">
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                      <span className="text-lg font-semibold text-[var(--text-primary)]">
                        {fmt(sharesBalance, 18)} {borrowSymbol}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ──── Right side: Deposit / Withdraw sidebar ──── */}
        <div ref={rightRef} className="lg:sticky lg:top-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            {/* Tab selector */}
            <div className="flex mb-5 bg-[var(--bg-secondary)] rounded-lg p-1">
              {(["deposit", "withdraw"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setSidebarTab(tab); if (tab === "deposit") resetWTx(); else resetTx(); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer capitalize ${
                    sidebarTab === tab
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {sidebarTab === "deposit" ? (
              /* ── Deposit ── */
              txStep === "success" ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-[var(--text-primary)] font-medium mb-1">Deposit Successful!</p>
                  <p className="text-xs text-[var(--text-tertiary)] mb-4">Liquidity has been added to the pool.</p>
                  <button
                    onClick={resetTx}
                    className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={supplyAmount}
                      onChange={(e) => {
                        if (/^\d*\.?\d*$/.test(e.target.value)) setSupplyAmount(e.target.value);
                      }}
                      disabled={txStep !== "idle"}
                      className="w-full bg-transparent outline-none text-2xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-2"
                    />
                    <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                      <span>
                        {isConnected && !isLoading
                          ? `${fmt(walletBalance, borrowDecimals)} ${borrowSymbol}`
                          : "—"}
                      </span>
                      {isConnected && !isLoading && (
                        <button
                          onClick={() => setSupplyAmount(formatUnits(walletBalance, borrowDecimals))}
                          disabled={txStep !== "idle"}
                          className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-4 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {borrowSymbol ? (
                          <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                        ) : (
                          <div className="w-[18px] h-[18px] rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                        )}
                        <span className="text-[var(--text-secondary)]">Deposit ({borrowSymbol || "..."})</span>
                      </div>
                      <span className="text-[var(--text-primary)] font-medium">
                        {supplyAmount || "0.00"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">APY</span>
                      <span className="text-[var(--accent)]">{supplyApy.toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">LTV</span>
                      <span className="text-[var(--text-primary)]">{ltv.toFixed(0)}%</span>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    onClick={handleSupply}
                    disabled={
                      txStep !== "idle" ||
                      !isConnected ||
                      isLoading ||
                      !supplyAmount ||
                      Number(supplyAmount) <= 0
                    }
                    className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    {!isConnected
                      ? "Connect Wallet"
                      : txStep === "approving"
                      ? "Approving..."
                      : txStep === "supplying"
                      ? "Depositing..."
                      : isLoading
                      ? "Loading..."
                      : "Deposit"}
                  </button>
                </>
              )
            ) : (
              /* ── Withdraw ── */
              wTxStep === "success" ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-[var(--text-primary)] font-medium mb-1">Withdraw Successful!</p>
                  <p className="text-xs text-[var(--text-tertiary)] mb-4">Liquidity has been withdrawn from the pool.</p>
                  <button
                    onClick={resetWTx}
                    className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Shares input */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={withdrawShares}
                      onChange={(e) => {
                        if (/^\d*\.?\d*$/.test(e.target.value)) setWithdrawShares(e.target.value);
                      }}
                      disabled={wTxStep !== "idle"}
                      className="w-full bg-transparent outline-none text-2xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-2"
                    />
                    <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                      <div className="flex items-center gap-1.5">
                        {borrowSymbol && <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={16} />}
                        <span>{isConnected && !isLoading ? `${fmt(sharesBalance, 18)} ${borrowSymbol}` : "—"}</span>
                      </div>
                      {isConnected && !isLoading && sharesBalance > 0n && (
                        <button
                          onClick={() => setWithdrawShares(formatUnits(sharesBalance, 18))}
                          disabled={wTxStep !== "idle"}
                          className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Info rows */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-4 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {borrowSymbol ? (
                          <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                        ) : (
                          <div className="w-[18px] h-[18px] rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                        )}
                        <span className="text-[var(--text-secondary)]">Withdraw ({borrowSymbol || "..."})</span>
                      </div>
                      <span className="text-[var(--text-primary)] font-medium">
                        {withdrawShares || "0.00"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">APY</span>
                      <span className="text-[var(--accent)]">{supplyApy.toFixed(2)}%</span>
                    </div>
                  </div>

                  {wErrorMsg && (
                    <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {wErrorMsg}
                    </div>
                  )}

                  <button
                    onClick={handleWithdraw}
                    disabled={
                      wTxStep !== "idle" ||
                      !isConnected ||
                      isLoading ||
                      !withdrawShares ||
                      Number(withdrawShares) <= 0
                    }
                    className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    {!isConnected
                      ? "Connect Wallet"
                      : wTxStep === "approving"
                      ? "Approving..."
                      : wTxStep === "withdrawing"
                      ? "Withdrawing..."
                      : isLoading
                      ? "Loading..."
                      : "Withdraw"}
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  extra,
}: {
  label: string;
  value: string;
  accent?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--text-tertiary)] mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
          {value}
        </span>
        {extra}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      {children}
    </div>
  );
}
