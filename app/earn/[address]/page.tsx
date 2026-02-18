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
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [wNeedsApproval, setWNeedsApproval] = useState(false);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const depositBackdropRef = useRef<HTMLDivElement>(null);
  const depositCardRef = useRef<HTMLDivElement>(null);
  const depositContentRef = useRef<HTMLDivElement>(null);
  const withdrawBackdropRef = useRef<HTMLDivElement>(null);
  const withdrawCardRef = useRef<HTMLDivElement>(null);
  const withdrawContentRef = useRef<HTMLDivElement>(null);

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
    setShowDepositModal(true);
  };

  const confirmSupply = () => {
    if (!userAddress || !borrowTokenAddr || !supplyAmount) return;
    setErrorMsg("");
    const amount = parseUnits(supplyAmount, borrowDecimals);
    if (allowance < amount) {
      setNeedsApproval(true);
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
      setNeedsApproval(false);
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
    setShowWithdrawModal(true);
  };

  const confirmWithdraw = () => {
    if (!userAddress || !sharesTokenAddr || !withdrawShares) return;
    setWErrorMsg("");
    const shares = parseUnits(withdrawShares, 18);
    if (sharesAllowance < shares) {
      setWNeedsApproval(true);
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
      setWNeedsApproval(false);
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

  // Tab switch animation
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!leftRef.current) return;
    const children = leftRef.current.children;
    if (!children.length) return;
    gsap.fromTo(children, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power3.out" });
  }, [activeTab]);

  // Modal entrance animations
  useEffect(() => {
    if (!showDepositModal) return;
    if (depositBackdropRef.current) {
      gsap.fromTo(depositBackdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" });
    }
    if (depositCardRef.current) {
      gsap.fromTo(depositCardRef.current, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" });
    }
  }, [showDepositModal]);

  useEffect(() => {
    if (!showWithdrawModal) return;
    if (withdrawBackdropRef.current) {
      gsap.fromTo(withdrawBackdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" });
    }
    if (withdrawCardRef.current) {
      gsap.fromTo(withdrawCardRef.current, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" });
    }
  }, [showWithdrawModal]);

  // Modal phase transition animations
  useEffect(() => {
    if (!showDepositModal || !depositContentRef.current) return;
    const children = depositContentRef.current.children;
    if (children.length) {
      gsap.fromTo(children, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power3.out" });
    }
  }, [txStep, showDepositModal]);

  useEffect(() => {
    if (!showWithdrawModal || !withdrawContentRef.current) return;
    const children = withdrawContentRef.current.children;
    if (children.length) {
      gsap.fromTo(children, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power3.out" });
    }
  }, [wTxStep, showWithdrawModal]);

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
                    !isConnected ||
                    isLoading ||
                    !supplyAmount ||
                    Number(supplyAmount) <= 0
                  }
                  className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!isConnected
                    ? "Connect Wallet"
                    : isLoading
                    ? "Loading..."
                    : "Deposit"}
                </button>
              </>
            ) : (
              /* ── Withdraw ── */
              <>
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
                    !isConnected ||
                    isLoading ||
                    !withdrawShares ||
                    Number(withdrawShares) <= 0
                  }
                  className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!isConnected
                    ? "Connect Wallet"
                    : isLoading
                    ? "Loading..."
                    : "Withdraw"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm Deposit Modal ── */}
      {showDepositModal && (() => {
        const isReview = txStep === "idle" || txStep === "error";
        const isConfirming = txStep === "approving" || txStep === "supplying";
        const isDone = txStep === "success";
        const activeTxHash = supplyTxHash ?? approveTxHash;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              ref={depositBackdropRef}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { if (isReview || isDone) { resetTx(); setShowDepositModal(false); if (isDone) setSupplyAmount(""); } }}
            />
            <div ref={depositCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {isDone ? "Transaction Successful" : isConfirming ? "Confirm" : "Review"}
                </h3>
                {(isReview || isDone) && (
                  <button
                    onClick={() => { resetTx(); setShowDepositModal(false); if (isDone) setSupplyAmount(""); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div ref={depositContentRef} className="px-6 pb-6 space-y-4">
                {/* Pool info card — Review & Confirm */}
                {!isDone && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {borrowSymbol}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] mb-1.5">Deposit</div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-[var(--text-primary)]">{supplyAmount}</span>
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={28} />
                    </div>
                  </div>
                )}

                {/* Review phase */}
                {isReview && (
                  <>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Deposit ({borrowSymbol})</span>
                        <span className="text-[var(--text-primary)] font-medium">{supplyAmount}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">APY</span>
                        <span className="text-[var(--accent)]">{supplyApy.toFixed(2)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">LTV</span>
                        <span className="text-[var(--text-primary)]">{ltv.toFixed(0)}%</span>
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (txStep === "error") { setTxStep("idle"); setErrorMsg(""); resetApprove(); resetSupply(); }
                        confirmSupply();
                      }}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {txStep === "error" ? "Retry" : "Confirm"}
                    </button>
                  </>
                )}

                {/* Confirming phase */}
                {isConfirming && (
                  <div className="space-y-4">
                    {activeTxHash && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {txStep === "approving" ? "Approve" : "Deposit"}
                        </span>
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${activeTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          {(activeTxHash as string).slice(0, 6)}...{(activeTxHash as string).slice(-4)}
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    )}

                    <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full animate-pulse"
                        style={{ width: txStep === "supplying" ? "70%" : "35%", transition: "width 1.5s ease-in-out" }}
                      />
                    </div>

                    <div className="flex items-center justify-center gap-2 py-2">
                      <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {needsApproval
                          ? txStep === "approving"
                            ? "Signature 1/2 — Proceed in your wallet"
                            : "Signature 2/2 — Proceed in your wallet"
                          : "Signature 1/1 — Proceed in your wallet"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Done phase */}
                {isDone && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center py-4">
                      <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                          <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">Deposit successful</p>
                    </div>

                    {supplyTxHash && (
                      <div className="flex items-center justify-center">
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${supplyTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          View on explorer
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    )}

                    <button
                      onClick={() => { resetTx(); setShowDepositModal(false); setSupplyAmount(""); }}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Confirm Withdraw Modal ── */}
      {showWithdrawModal && (() => {
        const isReview = wTxStep === "idle" || wTxStep === "error";
        const isConfirming = wTxStep === "approving" || wTxStep === "withdrawing";
        const isDone = wTxStep === "success";
        const activeTxHash = withdrawTxHash ?? wApproveTxHash;
        const estimatedUnderlying = (() => {
          try {
            const shares = parseUnits(withdrawShares || "0", 18);
            return sharesToUnderlying(shares);
          } catch { return 0n; }
        })();

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              ref={withdrawBackdropRef}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { if (isReview || isDone) { resetWTx(); setShowWithdrawModal(false); if (isDone) setWithdrawShares(""); } }}
            />
            <div ref={withdrawCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {isDone ? "Transaction Successful" : isConfirming ? "Confirm" : "Review"}
                </h3>
                {(isReview || isDone) && (
                  <button
                    onClick={() => { resetWTx(); setShowWithdrawModal(false); if (isDone) setWithdrawShares(""); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div ref={withdrawContentRef} className="px-6 pb-6 space-y-4">
                {/* Pool info card — Review & Confirm */}
                {!isDone && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {borrowSymbol}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] mb-1.5">Withdraw</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-[var(--text-primary)]">
                          {fmt(estimatedUnderlying, borrowDecimals)}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">{borrowSymbol}</span>
                      </div>
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={28} />
                    </div>
                  </div>
                )}

                {/* Review phase */}
                {isReview && (
                  <>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Withdraw ({borrowSymbol})</span>
                        <span className="text-[var(--text-primary)] font-medium">{fmt(estimatedUnderlying, borrowDecimals)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">APY</span>
                        <span className="text-[var(--accent)]">{supplyApy.toFixed(2)}%</span>
                      </div>
                    </div>

                    {wErrorMsg && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {wErrorMsg}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (wTxStep === "error") { setWTxStep("idle"); setWErrorMsg(""); resetWApprove(); resetWithdraw(); }
                        confirmWithdraw();
                      }}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {wTxStep === "error" ? "Retry" : "Confirm"}
                    </button>
                  </>
                )}

                {/* Confirming phase */}
                {isConfirming && (
                  <div className="space-y-4">
                    {activeTxHash && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {wTxStep === "approving" ? "Approve" : "Withdraw"}
                        </span>
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${activeTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          {(activeTxHash as string).slice(0, 6)}...{(activeTxHash as string).slice(-4)}
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    )}

                    <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full animate-pulse"
                        style={{ width: wTxStep === "withdrawing" ? "70%" : "35%", transition: "width 1.5s ease-in-out" }}
                      />
                    </div>

                    <div className="flex items-center justify-center gap-2 py-2">
                      <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {wNeedsApproval
                          ? wTxStep === "approving"
                            ? "Signature 1/2 — Proceed in your wallet"
                            : "Signature 2/2 — Proceed in your wallet"
                          : "Signature 1/1 — Proceed in your wallet"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Done phase */}
                {isDone && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center py-4">
                      <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                          <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">Withdraw successful</p>
                    </div>

                    {withdrawTxHash && (
                      <div className="flex items-center justify-center">
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${withdrawTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          View on explorer
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    )}

                    <button
                      onClick={() => { resetWTx(); setShowWithdrawModal(false); setWithdrawShares(""); }}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
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
