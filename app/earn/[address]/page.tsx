"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
import AnimatedCheckmark from "@/components/AnimatedCheckmark";
import PoolAreaChart from "@/components/charts/PoolAreaChart";
import TimePeriodSelect, { type TimePeriod, filterByTimePeriod } from "@/components/charts/TimePeriodSelect";
import { usePoolSnapshots } from "@/hooks/usePoolSnapshots";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { tokenDataStreamAbi } from "@/lib/abis/token-data-stream-abi";
import { CHAIN } from "@/lib/contracts";
import { gsap } from "@/hooks/useGsap";
import { usePoolTransactions, type TxFilter } from "@/hooks/usePoolTransactions";

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

function addressToGradient(addr: string): string {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = addr.charCodeAt(i) + ((h << 5) - h);
  const h1 = Math.abs(h) % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1},70%,55%), hsl(${h2},80%,45%))`;
}

function fmtChartDate(ts: number, spanDays: number): string {
  const d = new Date(ts * 1000);
  if (spanDays <= 7) {
    return (
      d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    );
  }
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
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
  const [activeTab, setActiveTab] = useState<"overview" | "position" | "manage">("overview");
  const [sidebarTab, setSidebarTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositsPeriod, setDepositsPeriod] = useState<TimePeriod>("3M");
  const [apyPeriod, setApyPeriod] = useState<TimePeriod>("1M");
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [wNeedsApproval, setWNeedsApproval] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [txPage, setTxPage] = useState(1);
  const [txFilterOpen, setTxFilterOpen] = useState(false);
  const txFilterRef = useRef<HTMLDivElement>(null);
  const txFilterMenuRef = useRef<HTMLDivElement>(null);
  const txFilterChevronRef = useRef<SVGSVGElement>(null);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const txTableRef = useRef<HTMLDivElement>(null);
  const depositBackdropRef = useRef<HTMLDivElement>(null);
  const depositCardRef = useRef<HTMLDivElement>(null);
  const depositContentRef = useRef<HTMLDivElement>(null);
  const withdrawBackdropRef = useRef<HTMLDivElement>(null);
  const withdrawCardRef = useRef<HTMLDivElement>(null);
  const withdrawContentRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const mobileSidebarContentRef = useRef<HTMLDivElement>(null);
  const prevSidebarTab = useRef(sidebarTab);

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

  // Token price from TokenDataStream
  const { data: tokenDataStreamAddr } = useReadContract({
    address: factoryAddr,
    abi: lendingPoolFactoryAbi,
    functionName: "tokenDataStream",
    chainId: CHAIN.id,
    query: { enabled: !!factoryAddr },
  });

  const { data: borrowPriceData } = useReadContracts({
    contracts: [
      { address: tokenDataStreamAddr as `0x${string}`, abi: tokenDataStreamAbi, functionName: "latestRoundData", args: [borrowTokenAddr!], chainId: CHAIN.id },
      { address: tokenDataStreamAddr as `0x${string}`, abi: tokenDataStreamAbi, functionName: "decimals", args: [borrowTokenAddr!], chainId: CHAIN.id },
    ],
    query: { enabled: !!tokenDataStreamAddr && !!borrowTokenAddr },
  });

  const borrowPrice = useMemo(() => {
    const priceRound = borrowPriceData?.[0]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
    const priceDec = borrowPriceData?.[1]?.result as bigint | undefined;
    if (!priceRound || !priceDec) return 1; // fallback to 1 for stablecoins
    return Number(formatUnits(priceRound[1], Number(priceDec)));
  }, [borrowPriceData]);

  // Pool transactions
  const { data: allTransactions, isLoading: txLoading } = usePoolTransactions(lendingPoolAddr);

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

  // ── Chart data ──
  const { data: snapshotData, isLoading: snapshotsLoading } = usePoolSnapshots(
    routerAddress as string | undefined,
    borrowDecimals,
    18, // collateralDecimals not used on earn page
    !isLoading,
  );
  const depositsChartData = useMemo(
    () => (snapshotData ? filterByTimePeriod(snapshotData, depositsPeriod) : []),
    [snapshotData, depositsPeriod],
  );
  const apyChartData = useMemo(
    () => (snapshotData ? filterByTimePeriod(snapshotData, apyPeriod) : []),
    [snapshotData, apyPeriod],
  );

  // ── Transactions pagination ──
  const TX_PER_PAGE = 10;
  const filteredTx = useMemo(() => {
    if (!allTransactions) return [];
    if (txFilter === "all") return allTransactions;
    return allTransactions.filter((t) => t.type === txFilter);
  }, [allTransactions, txFilter]);
  const txTotalPages = Math.max(1, Math.ceil(filteredTx.length / TX_PER_PAGE));
  const paginatedTx = useMemo(
    () => filteredTx.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE),
    [filteredTx, txPage],
  );
  // Reset page when filter changes
  useEffect(() => { setTxPage(1); }, [txFilter]);

  // ── User transactions (for Position tab) ──
  const USER_TX_PER_PAGE = 5;
  const [userTxPage, setUserTxPage] = useState(1);
  const userTxRowsRef = useRef<HTMLDivElement>(null);
  const userTx = useMemo(() => {
    if (!allTransactions || !userAddress) return [];
    return allTransactions.filter((t) => t.user.toLowerCase() === userAddress.toLowerCase());
  }, [allTransactions, userAddress]);
  const userTxTotalPages = Math.max(1, Math.ceil(userTx.length / USER_TX_PER_PAGE));
  const paginatedUserTx = useMemo(
    () => userTx.slice((userTxPage - 1) * USER_TX_PER_PAGE, userTxPage * USER_TX_PER_PAGE),
    [userTx, userTxPage],
  );

  // Animate user tx rows on page change
  useEffect(() => {
    if (!userTxRowsRef.current) return;
    const rows = userTxRowsRef.current.children;
    if (!rows.length) return;
    gsap.fromTo(
      rows,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power3.out" },
    );
  }, [userTxPage]);

  // ── Tx filter dropdown ──
  const TX_FILTERS: { value: TxFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "deposit", label: "Deposits" },
    { value: "withdraw", label: "Withdrawals" },
  ];

  const closeTxFilterDropdown = useCallback(() => {
    const menu = txFilterMenuRef.current;
    const chevron = txFilterChevronRef.current;
    if (!menu) { setTxFilterOpen(false); return; }
    gsap.to(menu, { autoAlpha: 0, y: -8, scaleY: 0.9, duration: 0.2, ease: "power3.in", onComplete: () => setTxFilterOpen(false) });
    if (chevron) gsap.to(chevron, { rotation: 0, duration: 0.2, ease: "power3.in" });
  }, []);

  const toggleTxFilterDropdown = useCallback(() => {
    if (txFilterOpen) closeTxFilterDropdown();
    else setTxFilterOpen(true);
  }, [txFilterOpen, closeTxFilterDropdown]);

  useEffect(() => {
    if (!txFilterOpen) return;
    const menu = txFilterMenuRef.current;
    const chevron = txFilterChevronRef.current;
    if (!menu) return;
    gsap.set(menu, { autoAlpha: 0, y: -8, scaleY: 0.9, transformOrigin: "top center" });
    gsap.to(menu, { autoAlpha: 1, y: 0, scaleY: 1, duration: 0.25, ease: "power3.out" });
    if (chevron) gsap.to(chevron, { rotation: 180, duration: 0.25, ease: "power3.out" });
  }, [txFilterOpen]);

  useEffect(() => {
    if (!txFilterOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (txFilterRef.current && !txFilterRef.current.contains(e.target as Node)) closeTxFilterDropdown();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [txFilterOpen, closeTxFilterDropdown]);

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

  // Animate transaction rows on page/filter change
  useEffect(() => {
    if (!txTableRef.current || paginatedTx.length === 0) return;
    const rows = txTableRef.current.querySelectorAll<HTMLElement>(".tx-row");
    if (!rows.length) return;
    gsap.fromTo(
      rows,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power3.out" },
    );
  }, [paginatedTx, txFilter, txPage]);

  // Sidebar deposit/withdraw tab switch animation (desktop + mobile)
  useEffect(() => {
    if (isLoading) return;
    // Skip initial mount
    if (prevSidebarTab.current === sidebarTab) return;
    const goingRight = sidebarTab === "withdraw";
    prevSidebarTab.current = sidebarTab;

    const timelines: gsap.core.Timeline[] = [];

    [sidebarContentRef, mobileSidebarContentRef].forEach((ref) => {
      const el = ref.current;
      if (!el) return;
      const children = el.children;
      if (!children.length) return;

      const tl = gsap.timeline();
      tl.fromTo(
        el,
        { opacity: 0, x: goingRight ? 40 : -40 },
        { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" },
      );
      tl.fromTo(
        children,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power3.out" },
        "-=0.2",
      );
      timelines.push(tl);
    });

    return () => { timelines.forEach((tl) => tl.kill()); };
  }, [sidebarTab, isLoading]);

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
      <div className="flex gap-6 border-b border-white/[0.06]">
        {(["overview", "position", "manage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${
              tab === "manage" ? "lg:hidden " : ""
            }${
              activeTab === tab
                ? "text-[var(--text-primary)] border-b-2 border-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "position" ? "Your Position" : "Manage Position"}
          </button>
        ))}
      </div>

      {/* Main content: Left overview + Right deposit sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* ──── Left side: Pool overview ──── */}
        <div ref={leftRef} className="space-y-6">
          {activeTab === "overview" ? (
            <>
              {/* Pool stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-4 space-y-2">
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

              {/* Total Deposits chart */}
              <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Total Deposits {borrowSymbol ? `(${borrowSymbol})` : ""}
                  </span>
                  <TimePeriodSelect value={depositsPeriod} onChange={setDepositsPeriod} />
                </div>
                {isLoading ? (
                  <Skeleton className="h-9 w-48 mb-4" />
                ) : (
                  <div className="text-3xl font-bold text-[var(--text-primary)] mb-4">
                    {totalSupplyAssets !== undefined ? fmt(totalSupplyAssets, borrowDecimals) : "0.00"}
                    <span className="text-lg font-normal text-[var(--text-tertiary)] ml-2">{borrowSymbol}</span>
                  </div>
                )}
                {snapshotsLoading ? (
                  <Skeleton className="h-[220px] w-full rounded-lg" />
                ) : depositsChartData.length > 0 ? (
                  <PoolAreaChart
                    data={depositsChartData}
                    dataKey="totalDeposits"
                    gradientId="depositsGradient"
                    formatValue={(v) =>
                      v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    }
                    yAxisFormatter={(v) =>
                      v >= 1e6
                        ? `${(v / 1e6).toFixed(1)}M`
                        : v >= 1e3
                        ? `${(v / 1e3).toFixed(0)}K`
                        : `${v}`
                    }
                  />
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-[var(--text-tertiary)]">
                    No historical data available
                  </div>
                )}
              </div>

              {/* APY chart */}
              <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-tertiary)]">APY</span>
                  <TimePeriodSelect value={apyPeriod} onChange={setApyPeriod} />
                </div>
                {isLoading ? (
                  <Skeleton className="h-9 w-32 mb-4" />
                ) : (
                  <div className="text-3xl font-bold text-[var(--accent)] mb-4">
                    {supplyApy.toFixed(2)}<span className="text-xl">%</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
                  <div>
                    {snapshotsLoading ? (
                      <Skeleton className="h-[220px] w-full rounded-lg" />
                    ) : apyChartData.length > 0 ? (
                      <PoolAreaChart
                        data={apyChartData}
                        dataKey="supplyApy"
                        gradientId="apyGradient"
                        formatValue={(v) => `${v.toFixed(2)}%`}
                        yAxisFormatter={(v) => `${v.toFixed(1)}%`}
                      />
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-sm text-[var(--text-tertiary)]">
                        No historical data available
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 md:border-l md:border-white/[0.06] md:pl-4">
                    {isLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between md:block">
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="w-3 h-3 rounded-sm bg-[var(--accent)]" />
                          <span className="text-xs text-[var(--text-tertiary)]">APY</span>
                        </div>
                        <span className="text-sm font-medium text-[var(--text-primary)]">{supplyApy.toFixed(2)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pool details */}
              <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pool Details</h3>

                {isLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-b-0">
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
                      <a
                        href={`${CHAIN.blockExplorers?.default.url}/address/${lendingPoolAddr}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {shortenAddr(lendingPoolAddr)}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                          <path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    </DetailRow>

                    {routerAddress && (
                      <DetailRow label="Router Address">
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/address/${routerAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          {shortenAddr(routerAddress)}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                            <path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </DetailRow>
                    )}

                  </div>
                )}
              </div>

              {/* All transactions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">All transactions</h3>

                  {/* Mobile: custom dropdown */}
                  <div ref={txFilterRef} className="relative md:hidden">
                    <button
                      onClick={toggleTxFilterDropdown}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[rgba(8,12,28,0.65)] border border-white/[0.08] text-sm font-medium text-[var(--text-primary)] cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      {TX_FILTERS.find((f) => f.value === txFilter)?.label}
                      <svg ref={txFilterChevronRef} width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[var(--text-tertiary)]">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {txFilterOpen && (
                      <div
                        ref={txFilterMenuRef}
                        className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[140px] py-1.5 rounded-xl bg-[rgba(8,12,28,0.95)] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                      >
                        {TX_FILTERS.map((f) => (
                          <button
                            key={f.value}
                            onClick={() => { setTxFilter(f.value); closeTxFilterDropdown(); }}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                              txFilter === f.value
                                ? "text-[var(--text-primary)] bg-white/[0.08]"
                                : "text-[var(--text-secondary)] active:bg-white/[0.05]"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Desktop: inline buttons */}
                  <div className="hidden md:flex items-center gap-2">
                    {TX_FILTERS.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setTxFilter(f.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                          txFilter === f.value
                            ? "bg-white/[0.1] text-[var(--text-primary)]"
                            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div ref={txTableRef} className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
                  {/* Header — desktop only */}
                  <div className="hidden md:grid grid-cols-[1.5fr_1fr_2fr_1.5fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
                    <span className="flex items-center gap-1">
                      Date
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 7L2 4h6L5 7z" fill="currentColor" />
                      </svg>
                    </span>
                    <span>Type</span>
                    <span>Amount</span>
                    <span>User</span>
                    <span className="text-right">Transaction</span>
                  </div>

                  {/* Rows */}
                  {txLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="px-4 md:px-6 py-4 border-b border-white/[0.06] last:border-b-0">
                        <div className="md:hidden space-y-2">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-16" />
                          </div>
                          <Skeleton className="h-4 w-32" />
                        </div>
                        <div className="hidden md:grid grid-cols-[1.5fr_1fr_2fr_1.5fr_1.5fr] items-center">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-4 w-28 ml-auto" />
                        </div>
                      </div>
                    ))
                  ) : paginatedTx.length === 0 ? (
                    <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
                      No transactions found
                    </div>
                  ) : (
                    paginatedTx.map((tx) => {
                      const amount = Number(formatUnits(BigInt(tx.amount), borrowDecimals));
                      const usd = amount * borrowPrice;
                      const fmtUsd = usd >= 1_000_000
                        ? `$${(usd / 1_000_000).toFixed(2)}M`
                        : usd >= 1_000
                          ? `$${(usd / 1_000).toFixed(2)}k`
                          : `$${usd.toFixed(2)}`;
                      const fmtAmount = amount >= 1_000_000
                        ? `${(amount / 1_000_000).toFixed(2)}M`
                        : amount >= 1_000
                          ? `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                          : amount.toFixed(2);

                      const date = new Date(tx.timestamp * 1000);
                      const datePart =
                        date.getFullYear() +
                        "-" + String(date.getMonth() + 1).padStart(2, "0") +
                        "-" + String(date.getDate()).padStart(2, "0");
                      const timePart =
                        String(date.getHours()).padStart(2, "0") +
                        ":" + String(date.getMinutes()).padStart(2, "0") +
                        ":" + String(date.getSeconds()).padStart(2, "0");
                      const dateStr = `${datePart} ${timePart}`;

                      return (
                        <div
                          key={tx.id}
                          className="tx-row border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.03] transition-colors"
                        >
                          {/* ── Mobile layout ── */}
                          <div className="md:hidden px-4 py-3 space-y-2.5">
                            {/* Row 1: Type + Date */}
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {tx.type === "deposit" ? "Deposit" : "Withdraw"}
                              </span>
                              <span className="text-xs text-[var(--text-tertiary)]">
                                {datePart} <span className="text-[var(--text-tertiary)]/60">{timePart}</span>
                              </span>
                            </div>
                            {/* Row 2: Amount + USD */}
                            <div className="flex items-center gap-2">
                              <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {fmtAmount} {borrowSymbol}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] bg-white/[0.06] px-1.5 py-0.5 rounded">
                                {fmtUsd}
                              </span>
                            </div>
                            {/* Row 3: User + Tx link */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ background: addressToGradient(tx.user) }}
                                />
                                <span className="text-xs font-mono text-[var(--text-tertiary)]">
                                  {shortenAddr(tx.user)}
                                </span>
                              </div>
                              <a
                                href={`${CHAIN.blockExplorers?.default.url}/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                {shortenAddr(tx.txHash)}
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                                  <path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </a>
                            </div>
                          </div>

                          {/* ── Desktop layout ── */}
                          <div className="hidden md:grid grid-cols-[1.5fr_1fr_2fr_1.5fr_1.5fr] items-center px-6 py-4">
                            <span className="text-sm text-[var(--text-secondary)]">{dateStr}</span>
                            <span className="text-sm text-[var(--text-primary)]">
                              {tx.type === "deposit" ? "Deposit" : "Withdraw"}
                            </span>
                            <div className="flex items-center gap-2">
                              <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={20} />
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {fmtAmount} {borrowSymbol}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] bg-white/[0.06] px-1.5 py-0.5 rounded">
                                {fmtUsd}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-5 h-5 rounded-full flex-shrink-0"
                                style={{ background: addressToGradient(tx.user) }}
                              />
                              <span className="text-sm font-mono text-[var(--text-secondary)]">
                                {shortenAddr(tx.user)}
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <a
                                href={`${CHAIN.blockExplorers?.default.url}/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                {shortenAddr(tx.txHash)}
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                                  <path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination */}
                {filteredTx.length > TX_PER_PAGE && (
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <button
                      onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                      disabled={txPage <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M8.5 3.5L5 7l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {txPage} of {txTotalPages}
                    </span>
                    <button
                      onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                      disabled={txPage >= txTotalPages}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5.5 3.5L9 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : activeTab === "position" ? (
            /* Position tab */
            <>
            <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-6">
              {!isConnected ? (
                <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
                  Connect your wallet to view your position.
                </div>
              ) : isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-5 w-32" />
                  <div className="bg-white/[0.04] rounded-xl p-4 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Your Position</h3>
                  <div className="bg-white/[0.04] rounded-xl p-4">
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

            {/* Your Transactions */}
            {isConnected && (
              <div className="space-y-3 mt-2">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Your Transactions</h3>
                <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl overflow-hidden">
                  {/* Header — desktop only */}
                  <div className="hidden md:grid grid-cols-[1.5fr_1fr_2fr_1.5fr] px-6 py-3 border-b border-white/[0.06] text-xs text-[var(--text-tertiary)] font-medium">
                    <span>Date</span>
                    <span>Type</span>
                    <span>Amount</span>
                    <span className="text-right">Transaction</span>
                  </div>

                  {txLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="px-4 md:px-6 py-4 border-b border-white/[0.06] last:border-b-0">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </div>
                    ))
                  ) : paginatedUserTx.length === 0 ? (
                    <div className="py-10 text-center text-sm text-[var(--text-tertiary)]">
                      No transactions yet
                    </div>
                  ) : (
                    <div ref={userTxRowsRef}>
                    {paginatedUserTx.map((tx) => {
                      const amount = Number(formatUnits(BigInt(tx.amount), borrowDecimals));
                      const usd = amount * borrowPrice;
                      const fmtUsd = usd >= 1_000_000
                        ? `$${(usd / 1_000_000).toFixed(2)}M`
                        : usd >= 1_000
                          ? `$${(usd / 1_000).toFixed(2)}k`
                          : `$${usd.toFixed(2)}`;
                      const fmtAmount = amount >= 1_000_000
                        ? `${(amount / 1_000_000).toFixed(2)}M`
                        : amount >= 1_000
                          ? `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                          : amount.toFixed(2);
                      const date = new Date(tx.timestamp * 1000);
                      const datePart =
                        date.getFullYear() +
                        "-" + String(date.getMonth() + 1).padStart(2, "0") +
                        "-" + String(date.getDate()).padStart(2, "0");
                      const timePart =
                        String(date.getHours()).padStart(2, "0") +
                        ":" + String(date.getMinutes()).padStart(2, "0") +
                        ":" + String(date.getSeconds()).padStart(2, "0");

                      return (
                        <div key={tx.id} className="border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.03] transition-colors">
                          {/* Mobile */}
                          <div className="md:hidden px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {tx.type === "deposit" ? "Deposit" : "Withdraw"}
                              </span>
                              <span className="text-xs text-[var(--text-tertiary)]">
                                {datePart} <span className="opacity-60">{timePart}</span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                                <span className="text-sm font-medium text-[var(--text-primary)]">
                                  {fmtAmount} {borrowSymbol}
                                </span>
                                <span className="text-[10px] text-[var(--text-tertiary)] bg-white/[0.06] px-1.5 py-0.5 rounded">
                                  {fmtUsd}
                                </span>
                              </div>
                              <a
                                href={`${CHAIN.blockExplorers?.default.url}/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                {shortenAddr(tx.txHash)}
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </a>
                            </div>
                          </div>
                          {/* Desktop */}
                          <div className="hidden md:grid grid-cols-[1.5fr_1fr_2fr_1.5fr] items-center px-6 py-4">
                            <span className="text-sm text-[var(--text-secondary)]">{datePart} {timePart}</span>
                            <span className="text-sm text-[var(--text-primary)]">
                              {tx.type === "deposit" ? "Deposit" : "Withdraw"}
                            </span>
                            <div className="flex items-center gap-2">
                              <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={20} />
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {fmtAmount} {borrowSymbol}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] bg-white/[0.06] px-1.5 py-0.5 rounded">
                                {fmtUsd}
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <a
                                href={`${CHAIN.blockExplorers?.default.url}/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                {shortenAddr(tx.txHash)}
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {userTx.length > USER_TX_PER_PAGE && (
                  <div className="flex items-center justify-center gap-4 pt-1">
                    <button
                      onClick={() => setUserTxPage((p) => Math.max(1, p - 1))}
                      disabled={userTxPage <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 3.5L5 7l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {userTxPage} of {userTxTotalPages}
                    </span>
                    <button
                      onClick={() => setUserTxPage((p) => Math.min(userTxTotalPages, p + 1))}
                      disabled={userTxPage >= userTxTotalPages}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 3.5L9 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            </>
          ) : (
            /* Manage Position tab (mobile only) */
            <div className="lg:hidden">
              <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-5">
                {/* Tab selector */}
                <div className="flex mb-5 bg-white/[0.04] rounded-lg p-1">
                  {(["deposit", "withdraw"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => { setSidebarTab(tab); if (tab === "deposit") resetWTx(); else resetTx(); }}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer capitalize ${
                        sidebarTab === tab
                          ? "bg-white/[0.08] text-[var(--text-primary)] shadow-sm"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 space-y-3">
                      <Skeleton className="h-8 w-full" />
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                    </div>
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : sidebarTab === "deposit" ? (
                  <div ref={mobileSidebarContentRef}>
                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-3">
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
                        <span className="flex items-center gap-1">
                          {isConnected && !isLoading && borrowSymbol && (
                            <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={14} />
                          )}
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

                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-4 space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                          <span className="text-[var(--text-secondary)]">Deposit ({borrowSymbol})</span>
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
                      disabled={!isConnected || isLoading || !supplyAmount || Number(supplyAmount) <= 0}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {!isConnected ? "Connect Wallet" : "Deposit"}
                    </button>
                  </div>
                ) : (
                  <div ref={mobileSidebarContentRef}>
                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-3">
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
                          <span>{isConnected ? `${fmt(sharesBalance, 18)} ${borrowSymbol}` : "—"}</span>
                        </div>
                        {isConnected && sharesBalance > 0n && (
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

                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-4 space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                          <span className="text-[var(--text-secondary)]">Withdraw ({borrowSymbol})</span>
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
                      disabled={!isConnected || !withdrawShares || Number(withdrawShares) <= 0}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {!isConnected ? "Connect Wallet" : "Withdraw"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ──── Right side: Deposit / Withdraw sidebar (desktop only) ──── */}
        <div ref={rightRef} className="hidden lg:block lg:sticky lg:top-6">
          <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-5">
            {/* Tab selector */}
            <div className="flex mb-5 bg-white/[0.04] rounded-lg p-1">
              {(["deposit", "withdraw"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setSidebarTab(tab); if (tab === "deposit") resetWTx(); else resetTx(); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer capitalize ${
                    sidebarTab === tab
                      ? "bg-white/[0.08] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {isLoading ? (
              /* ── Sidebar skeleton ── */
              <div className="space-y-3">
                <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
                <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : sidebarTab === "deposit" ? (
              /* ── Deposit ── */
              <div ref={sidebarContentRef}>
                <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-3">
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
                    <span className="flex items-center gap-1">
                      {isConnected && !isLoading && borrowSymbol && (
                        <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={14} />
                      )}
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

                <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                      <span className="text-[var(--text-secondary)]">Deposit ({borrowSymbol})</span>
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
                    : "Deposit"}
                </button>
              </div>
            ) : (
              /* ── Withdraw ── */
              <div ref={sidebarContentRef}>
                <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-3">
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
                      <span>{isConnected ? `${fmt(sharesBalance, 18)} ${borrowSymbol}` : "—"}</span>
                    </div>
                    {isConnected && sharesBalance > 0n && (
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

                <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 mb-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={18} />
                      <span className="text-[var(--text-secondary)]">Withdraw ({borrowSymbol})</span>
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
                    !withdrawShares ||
                    Number(withdrawShares) <= 0
                  }
                  className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!isConnected
                    ? "Connect Wallet"
                    : "Withdraw"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm Deposit Modal ── */}
      {showDepositModal && createPortal((() => {
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
            <div ref={depositCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
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
                  <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4">
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
                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 space-y-3">
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
                      <div className="mb-3">
                        <AnimatedCheckmark />
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
      })(), document.body)}

      {/* ── Confirm Withdraw Modal ── */}
      {showWithdrawModal && createPortal((() => {
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
            <div ref={withdrawCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
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
                  <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4">
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
                    <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4 space-y-3">
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
                      <div className="mb-3">
                        <AnimatedCheckmark />
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
      })(), document.body)}
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
    <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-xl p-4">
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
    <div className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-b-0">
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      {children}
    </div>
  );
}
