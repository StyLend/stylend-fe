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
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { tokenDataStreamAbi } from "@/lib/abis/token-data-stream-abi";
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

export default function BorrowDetailPage() {
  const { address: poolAddress } = useParams<{ address: string }>();
  const lendingPoolAddr = poolAddress as `0x${string}`;

  const { address: userAddress, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<"overview" | "position">("overview");
  const [sidebarTab, setSidebarTab] = useState<"collateral" | "borrow">("collateral");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [txStep, setTxStep] = useState<"idle" | "approving" | "supplying-collateral" | "borrowing" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "totalBorrowShares", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "ltv", chainId: CHAIN.id },
      { address: routerAddress as `0x${string}`, abi: lendingPoolRouterAbi, functionName: "factory", chainId: CHAIN.id },
    ],
    query: { enabled: !!routerAddress },
  });

  const borrowTokenAddr = routerData?.[0]?.result as `0x${string}` | undefined;
  const collateralTokenAddr = routerData?.[1]?.result as `0x${string}` | undefined;
  const totalSupplyAssets = routerData?.[2]?.result as bigint | undefined;
  const totalBorrowAssets = routerData?.[3]?.result as bigint | undefined;
  const totalBorrowShares = routerData?.[4]?.result as bigint | undefined;
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
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "decimals", chainId: CHAIN.id },
    ],
    query: { enabled: !!collateralTokenAddr },
  });

  // IRM + TokenDataStream addresses from factory
  const { data: factoryData } = useReadContracts({
    contracts: [
      { address: factoryAddr, abi: lendingPoolFactoryAbi, functionName: "interestRateModel", chainId: CHAIN.id },
      { address: factoryAddr, abi: lendingPoolFactoryAbi, functionName: "tokenDataStream", chainId: CHAIN.id },
    ],
    query: { enabled: !!factoryAddr },
  });

  const irmAddress = factoryData?.[0]?.result as `0x${string}` | undefined;
  const tokenDataStreamAddr = factoryData?.[1]?.result as `0x${string}` | undefined;

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

  // Token prices from TokenDataStream
  const { data: priceData } = useReadContracts({
    contracts: [
      { address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "latestRoundData", args: [collateralTokenAddr!], chainId: CHAIN.id },
      { address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "decimals", args: [collateralTokenAddr!], chainId: CHAIN.id },
      { address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "latestRoundData", args: [borrowTokenAddr!], chainId: CHAIN.id },
      { address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "decimals", args: [borrowTokenAddr!], chainId: CHAIN.id },
    ],
    query: { enabled: !!tokenDataStreamAddr && !!collateralTokenAddr && !!borrowTokenAddr },
  });

  const collateralPriceRaw = priceData?.[0]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
  const collateralPriceDecimals = priceData?.[1]?.result as bigint | undefined;
  const borrowPriceRaw = priceData?.[2]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
  const borrowPriceDecimals = priceData?.[3]?.result as bigint | undefined;

  // price is the second element (index 1) in latestRoundData tuple
  const collateralPrice = collateralPriceRaw?.[1] ?? 0n;
  const borrowPrice = borrowPriceRaw?.[1] ?? 0n;
  const collateralPriceDec = Number(collateralPriceDecimals ?? 8n);
  const borrowPriceDec = Number(borrowPriceDecimals ?? 8n);

  const borrowSymbol = (borrowInfo?.[0]?.result as string) ?? "";
  const borrowName = (borrowInfo?.[1]?.result as string) ?? "";
  const borrowDecimals = (borrowInfo?.[2]?.result as number) ?? 18;
  const collateralSymbol = (collateralInfo?.[0]?.result as string) ?? "";
  const collateralName = (collateralInfo?.[1]?.result as string) ?? "";
  const collateralDecimals = (collateralInfo?.[2]?.result as number) ?? 18;
  const isLoading = !borrowSymbol;

  // User position data
  const { data: userPositionAddr } = useReadContract({
    address: routerAddress as `0x${string}`,
    abi: lendingPoolRouterAbi,
    functionName: "addressPositions",
    args: [userAddress!],
    chainId: CHAIN.id,
    query: { enabled: !!routerAddress && !!userAddress },
  });

  const { data: userBorrowShares } = useReadContract({
    address: routerAddress as `0x${string}`,
    abi: lendingPoolRouterAbi,
    functionName: "userBorrowShares",
    args: [userAddress!],
    chainId: CHAIN.id,
    query: { enabled: !!routerAddress && !!userAddress },
  });

  const hasPosition = userPositionAddr && userPositionAddr !== "0x0000000000000000000000000000000000000000";

  // Collateral balance = collateral token balance held by position contract
  const { data: positionCollateralBalance, refetch: refetchCollateral } = useReadContract({
    address: collateralTokenAddr,
    abi: mockErc20Abi,
    functionName: "balanceOf",
    args: [userPositionAddr!],
    chainId: CHAIN.id,
    query: { enabled: !!collateralTokenAddr && !!hasPosition },
  });

  // User wallet balances
  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "balanceOf", args: [userAddress!], chainId: CHAIN.id },
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "allowance", args: [userAddress!, lendingPoolAddr], chainId: CHAIN.id },
    ],
    query: { enabled: !!collateralTokenAddr && !!userAddress },
  });

  const walletCollateralBalance = (userData?.[0]?.result as bigint) ?? 0n;
  const collateralAllowance = (userData?.[1]?.result as bigint) ?? 0n;

  // Computed
  const liquidity =
    totalSupplyAssets !== undefined && totalBorrowAssets !== undefined
      ? totalSupplyAssets - totalBorrowAssets
      : undefined;
  const ltv = ltvRaw ? Number(ltvRaw) / 1e16 : 0;
  const utilization =
    totalSupplyAssets && totalSupplyAssets > 0n
      ? Number((totalBorrowAssets ?? 0n) * 10000n / totalSupplyAssets) / 100
      : 0;

  const borrowApy = borrowRate ? Number(borrowRate) / 1e18 * 100 : 0;

  const supplyApy = (() => {
    if (!totalSupplyAssets || totalSupplyAssets === 0n || borrowRate === undefined) return 0;
    const borrowRateNum = Number(borrowRate) / 1e18;
    const utilizationNum = Number(totalBorrowAssets ?? 0n) / Number(totalSupplyAssets);
    const reserveFactorNum = reserveFactor && reserveFactor > 0n
      ? Number(reserveFactor) / 1e18
      : 0.1;
    return borrowRateNum * utilizationNum * (1 - reserveFactorNum) * 100;
  })();

  // Convert user borrow shares to borrow amount
  const userBorrowAmount = (() => {
    if (!userBorrowShares || userBorrowShares === 0n) return 0n;
    if (!totalBorrowShares || totalBorrowShares === 0n) return 0n;
    if (!totalBorrowAssets) return 0n;
    return (userBorrowShares * totalBorrowAssets) / totalBorrowShares;
  })();

  // Collateral value in USD = collateral amount * collateral price (normalized)
  // Borrow value in USD = borrow amount * borrow price (normalized)
  const collateralValueUsd = (() => {
    if (!positionCollateralBalance || collateralPrice === 0n) return 0;
    return Number(formatUnits(positionCollateralBalance, collateralDecimals)) *
           Number(formatUnits(collateralPrice, collateralPriceDec));
  })();

  const borrowValueUsd = (() => {
    if (userBorrowAmount === 0n || borrowPrice === 0n) return 0;
    return Number(formatUnits(userBorrowAmount, borrowDecimals)) *
           Number(formatUnits(borrowPrice, borrowPriceDec));
  })();

  // Health Factor = collateral value / borrow value
  const healthFactor = (() => {
    if (borrowValueUsd === 0) return Infinity;
    if (collateralValueUsd === 0) return 0;
    return collateralValueUsd / borrowValueUsd;
  })();

  // Max borrowable (in borrow token) = (collateral value * LTV) / borrow price
  const maxBorrowable = (() => {
    if (!positionCollateralBalance || !ltvRaw || collateralPrice === 0n || borrowPrice === 0n) return 0n;
    // collateralValue (in price decimals) = collateralBalance * collateralPrice
    // maxBorrowValue = collateralValue * ltv / 1e18
    // maxBorrowTokens = maxBorrowValue / borrowPrice (adjusted for decimals)
    const collateralValueScaled = positionCollateralBalance * collateralPrice;
    const maxBorrowValue = collateralValueScaled * ltvRaw / BigInt(1e18);
    // Adjust for decimal differences: result has (collateralDecimals + collateralPriceDec) decimals
    // We need borrowDecimals, so divide by borrowPrice (borrowPriceDec decimals) and adjust
    const borrowPriceScaled = borrowPrice;
    if (borrowPriceScaled === 0n) return 0n;
    // maxBorrowTokens = maxBorrowValue * 10^borrowDecimals / (borrowPrice * 10^collateralDecimals)
    // Simplify: maxBorrowValue has (collateralDecimals + collateralPriceDec) decimals
    // Divide by borrowPrice (borrowPriceDec) → result has collateralDecimals decimals
    // Multiply by 10^borrowDecimals / 10^collateralDecimals to normalize
    const result = maxBorrowValue * BigInt(10 ** borrowDecimals) / (borrowPriceScaled * BigInt(10 ** collateralDecimals));
    // Subtract existing borrow
    return result > userBorrowAmount ? result - userBorrowAmount : 0n;
  })();

  // ── Write hooks ──
  const { writeContract: writeApprove, data: approveTxHash, reset: resetApprove } = useWriteContract();
  const { writeContract: writeCollateral, data: collateralTxHash, reset: resetCollateral } = useWriteContract();
  const { writeContract: writeBorrow, data: borrowTxHash, reset: resetBorrow } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: collateralConfirmed } = useWaitForTransactionReceipt({ hash: collateralTxHash });
  const { isSuccess: borrowConfirmed } = useWaitForTransactionReceipt({ hash: borrowTxHash });

  // Supply collateral tx
  const doSupplyCollateralTx = useCallback(() => {
    if (!userAddress) return;
    const amount = parseUnits(collateralAmount, collateralDecimals);
    setTxStep("supplying-collateral");
    writeCollateral(
      {
        address: lendingPoolAddr,
        abi: lendingPoolAbi,
        functionName: "supplyCollateral",
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
  }, [userAddress, collateralAmount, collateralDecimals, lendingPoolAddr, writeCollateral]);

  // After approve confirmed → supply collateral
  useEffect(() => {
    if (approveConfirmed && txStep === "approving") doSupplyCollateralTx();
  }, [approveConfirmed, txStep, doSupplyCollateralTx]);

  // After collateral supplied
  useEffect(() => {
    if (collateralConfirmed && txStep === "supplying-collateral") {
      setTxStep("success");
      setCollateralAmount("");
      refetchRouter();
      refetchUser();
      refetchCollateral();
    }
  }, [collateralConfirmed, txStep, refetchRouter, refetchUser, refetchCollateral]);

  // After borrow confirmed
  useEffect(() => {
    if (borrowConfirmed && txStep === "borrowing") {
      setTxStep("success");
      setBorrowAmount("");
      refetchRouter();
      refetchUser();
      refetchCollateral();
    }
  }, [borrowConfirmed, txStep, refetchRouter, refetchUser, refetchCollateral]);

  const handleSupplyCollateral = () => {
    if (!userAddress || !collateralTokenAddr || !collateralAmount) return;
    setErrorMsg("");
    const amount = parseUnits(collateralAmount, collateralDecimals);
    if (amount <= 0n) return;
    if (amount > walletCollateralBalance) {
      setErrorMsg("Insufficient balance");
      return;
    }
    if (collateralAllowance < amount) {
      setTxStep("approving");
      writeApprove(
        {
          address: collateralTokenAddr,
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
      doSupplyCollateralTx();
    }
  };

  const handleBorrow = () => {
    if (!userAddress || !borrowAmount) return;
    setErrorMsg("");
    const amount = parseUnits(borrowAmount, borrowDecimals);
    if (amount <= 0n) return;
    if (liquidity !== undefined && amount > liquidity) {
      setErrorMsg("Exceeds available liquidity");
      return;
    }
    // LTV protection: check if borrow amount exceeds max borrowable
    if (amount > maxBorrowable + userBorrowAmount) {
      setErrorMsg("Exceeds maximum borrowable amount based on your collateral and LTV");
      return;
    }
    if (!hasPosition || !positionCollateralBalance || positionCollateralBalance === 0n) {
      setErrorMsg("Supply collateral first before borrowing");
      return;
    }
    setTxStep("borrowing");
    writeBorrow(
      {
        address: lendingPoolAddr,
        abi: lendingPoolAbi,
        functionName: "borrowDebt",
        args: [amount],
        chainId: CHAIN.id,
      },
      {
        onError: (err) => {
          setTxStep("error");
          setErrorMsg(err.message.split("\n")[0]);
        },
      }
    );
  };

  const resetTx = () => {
    setTxStep("idle");
    setErrorMsg("");
    resetApprove();
    resetCollateral();
    resetBorrow();
  };

  // GSAP
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
        href="/borrow"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Borrow
      </Link>

      {/* Dashboard header */}
      <div className="flex items-center gap-4">
        {isLoading ? (
          <>
            <div className="relative w-16 h-10">
              <div className="absolute left-0 w-10 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
              <div className="absolute left-6 w-10 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            </div>
            <div className="h-8 w-48 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          </>
        ) : (
          <>
            <div className="relative w-16 h-10">
              <div className="absolute left-0 z-10">
                <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={40} />
              </div>
              <div className="absolute left-6">
                <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={40} />
              </div>
            </div>
            <h1 className="text-2xl font-bold">
              <span className="text-[var(--text-primary)]">{collateralSymbol}</span>
              <span className="text-[var(--text-tertiary)]"> / </span>
              <span className="text-[var(--text-tertiary)]">{borrowSymbol}</span>
            </h1>
            <span className="text-xs font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2.5 py-1 rounded-full">
              {ltv.toFixed(0)}%
            </span>
          </>
        )}
      </div>

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

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* ──── Left side ──── */}
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
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  ))
                ) : (
                  <>
                    <StatCard label="Total Borrowed" value={totalBorrowAssets !== undefined ? `${fmt(totalBorrowAssets, borrowDecimals)} ${borrowSymbol}` : "—"} />
                    <StatCard label="Available Liquidity" value={liquidity !== undefined ? `${fmt(liquidity, borrowDecimals)} ${borrowSymbol}` : "—"} />
                    <StatCard label="Borrow APY" value={`${borrowApy.toFixed(2)}%`} accent />
                    <StatCard label="Supply APY" value={`${supplyApy.toFixed(2)}%`} accent />
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
                    <DetailRow label="Collateral Token">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={20} />
                        <span className="text-sm text-[var(--text-primary)]">{collateralSymbol}</span>
                      </div>
                    </DetailRow>

                    <DetailRow label="Borrow Token">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={20} />
                        <span className="text-sm text-[var(--text-primary)]">{borrowSymbol}</span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="text-xs text-[var(--text-tertiary)] mb-1">Collateral Deposited</div>
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {hasPosition && positionCollateralBalance !== undefined
                          ? fmt(positionCollateralBalance as bigint, collateralDecimals)
                          : "0.00"}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)]">{collateralSymbol}</div>
                    </div>

                    <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="text-xs text-[var(--text-tertiary)] mb-1">Borrow Amount</div>
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {fmt(userBorrowAmount, borrowDecimals)}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)]">{borrowSymbol}</div>
                    </div>
                  </div>

                  {/* Health Factor */}
                  {hasPosition && userBorrowAmount > 0n && (
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="text-xs text-[var(--text-tertiary)] mb-1">Health Factor</div>
                      <div className="flex items-center gap-2">
                        <div className={`text-lg font-semibold ${
                          healthFactor === Infinity
                            ? "text-[var(--accent)]"
                            : healthFactor >= 1.5
                            ? "text-green-400"
                            : healthFactor >= 1.1
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}>
                          {healthFactor === Infinity ? "∞" : healthFactor.toFixed(2)}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          healthFactor === Infinity
                            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                            : healthFactor >= 1.5
                            ? "bg-green-500/10 text-green-400"
                            : healthFactor >= 1.1
                            ? "bg-yellow-500/10 text-yellow-400"
                            : "bg-red-500/10 text-red-400"
                        }`}>
                          {healthFactor === Infinity
                            ? "Safe"
                            : healthFactor >= 1.5
                            ? "Healthy"
                            : healthFactor >= 1.1
                            ? "At Risk"
                            : "Danger"}
                        </span>
                      </div>
                    </div>
                  )}

                  {hasPosition && (
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="text-xs text-[var(--text-tertiary)] mb-1">Position Address</div>
                      <span className="text-sm font-mono text-[var(--text-secondary)]">
                        {shortenAddr(userPositionAddr as string)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ──── Right side: Supply Collateral / Borrow sidebar ──── */}
        <div ref={rightRef} className="lg:sticky lg:top-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            {/* Sidebar tab selector */}
            <div className="flex mb-5 bg-[var(--bg-secondary)] rounded-lg p-1">
              {(["collateral", "borrow"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setSidebarTab(tab); resetTx(); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    sidebarTab === tab
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {tab === "collateral" ? "Supply Collateral" : "Borrow"}
                </button>
              ))}
            </div>

            {txStep === "success" ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[var(--text-primary)] font-medium mb-1">
                  {sidebarTab === "collateral" ? "Collateral Supplied!" : "Borrow Successful!"}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mb-4">
                  {sidebarTab === "collateral"
                    ? "Your collateral has been added to the position."
                    : "Tokens have been sent to your wallet."}
                </p>
                <button
                  onClick={resetTx}
                  className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : sidebarTab === "collateral" ? (
              <>
                {/* Supply Collateral form */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    Supply {collateralSymbol || "..."}
                  </span>
                  {collateralSymbol ? (
                    <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={24} />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  )}
                </div>

                {/* Amount input */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={collateralAmount}
                    onChange={(e) => {
                      if (/^\d*\.?\d*$/.test(e.target.value)) setCollateralAmount(e.target.value);
                    }}
                    disabled={txStep !== "idle"}
                    className="w-full bg-transparent outline-none text-2xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-2"
                  />
                  <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                    <span>
                      {isConnected && !isLoading
                        ? `${fmt(walletCollateralBalance, collateralDecimals)} ${collateralSymbol}`
                        : "—"}
                    </span>
                    {isConnected && !isLoading && (
                      <button
                        onClick={() => setCollateralAmount(formatUnits(walletCollateralBalance, collateralDecimals))}
                        disabled={txStep !== "idle"}
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
                    <span className="text-[var(--text-secondary)]">Collateral Amount</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {collateralAmount || "0.00"} {collateralSymbol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">LTV</span>
                    <span className="text-[var(--text-primary)]">{ltv.toFixed(0)}%</span>
                  </div>
                </div>

                {/* Error */}
                {errorMsg && (
                  <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {errorMsg}
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={handleSupplyCollateral}
                  disabled={
                    txStep !== "idle" ||
                    !isConnected ||
                    isLoading ||
                    !collateralAmount ||
                    Number(collateralAmount) <= 0
                  }
                  className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!isConnected
                    ? "Connect Wallet"
                    : txStep === "approving"
                    ? "Approving..."
                    : txStep === "supplying-collateral"
                    ? "Supplying Collateral..."
                    : isLoading
                    ? "Loading..."
                    : !collateralAmount || Number(collateralAmount) <= 0
                    ? "Enter an amount"
                    : "Supply Collateral"}
                </button>
              </>
            ) : (
              <>
                {/* Borrow form */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    Borrow {borrowSymbol || "..."}
                  </span>
                  {borrowSymbol ? (
                    <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                  )}
                </div>

                {/* Amount input */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={borrowAmount}
                    onChange={(e) => {
                      if (/^\d*\.?\d*$/.test(e.target.value)) setBorrowAmount(e.target.value);
                    }}
                    disabled={txStep !== "idle"}
                    className="w-full bg-transparent outline-none text-2xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-2"
                  />
                  <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                    <span>
                      {!isLoading && liquidity !== undefined
                        ? `Available: ${fmt(liquidity, borrowDecimals)} ${borrowSymbol}`
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Info rows */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Borrow Amount</span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {borrowAmount || "0.00"} {borrowSymbol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Borrow APY</span>
                    <span className="text-[var(--accent)]">{borrowApy.toFixed(2)}%</span>
                  </div>
                  {hasPosition && positionCollateralBalance && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Max Borrowable</span>
                      <span className="text-[var(--text-primary)]">
                        {fmt(maxBorrowable, borrowDecimals)} {borrowSymbol}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">LTV</span>
                    <span className="text-[var(--text-primary)]">{ltv.toFixed(0)}%</span>
                  </div>
                  {/* Current health factor */}
                  {hasPosition && userBorrowAmount > 0n && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Health Factor</span>
                      <span className={
                        healthFactor >= 1.5
                          ? "text-green-400"
                          : healthFactor >= 1.1
                          ? "text-yellow-400"
                          : "text-red-400"
                      }>
                        {healthFactor === Infinity ? "∞" : healthFactor.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {/* Projected health factor after borrow */}
                  {borrowAmount && Number(borrowAmount) > 0 && collateralValueUsd > 0 && borrowPrice > 0n && (
                    (() => {
                      const newBorrowValueUsd = borrowValueUsd +
                        Number(borrowAmount) * Number(formatUnits(borrowPrice, borrowPriceDec));
                      const projectedHf = newBorrowValueUsd > 0
                        ? collateralValueUsd / newBorrowValueUsd
                        : Infinity;
                      return (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text-secondary)]">New Health Factor</span>
                          <span className={
                            projectedHf >= 1.5
                              ? "text-green-400"
                              : projectedHf >= 1.1
                              ? "text-yellow-400"
                              : "text-red-400"
                          }>
                            {projectedHf === Infinity ? "∞" : projectedHf.toFixed(2)}
                          </span>
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Error */}
                {errorMsg && (
                  <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {errorMsg}
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={handleBorrow}
                  disabled={
                    txStep !== "idle" ||
                    !isConnected ||
                    isLoading ||
                    !borrowAmount ||
                    Number(borrowAmount) <= 0
                  }
                  className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!isConnected
                    ? "Connect Wallet"
                    : txStep === "borrowing"
                    ? "Borrowing..."
                    : isLoading
                    ? "Loading..."
                    : !borrowAmount || Number(borrowAmount) <= 0
                    ? "Enter an amount"
                    : "Borrow"}
                </button>
              </>
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
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--text-tertiary)] mb-1">{label}</div>
      <span className={`text-sm font-semibold ${accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
        {value}
      </span>
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
