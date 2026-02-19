"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { gsap } from "@/hooks/useGsap";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContracts,
  useReadContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, type Address } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import TokenIcon from "@/components/TokenIcon";
import AnimatedCheckmark from "@/components/AnimatedCheckmark";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { tokenDataStreamAbi } from "@/lib/abis/token-data-stream-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { CHAIN } from "@/lib/contracts";
import { useLendingPools } from "@/hooks/useLendingPools";

// ── Token definitions (from faucet) ──

const TOKENS = [
  { symbol: "WETH", name: "Wrapped Ether", address: "0x48b3f901d040796f9cda37469fc5436fca711366" as Address, decimals: 18, color: "#627EEA" },
  { symbol: "USDC", name: "USD Coin", address: "0x5602a3f9b8a935df32871bb1c6289f24620233f7" as Address, decimals: 6, color: "#2775CA" },
  { symbol: "USDT", name: "Tether USD", address: "0x21483bcde6e19fdb5acc1375c443ebb17147a69a" as Address, decimals: 6, color: "#50AF95" },
  { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0xacbc1ce1908b9434222e60d6cfed9e011a386220" as Address, decimals: 8, color: "#F7931A" },
];

type TokenInfo = (typeof TOKENS)[number];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const FEE_TIERS = [
  { value: 500, label: "0.05%" },
  { value: 1000, label: "0.10%" },
  { value: 3000, label: "0.30%" },
];

// Format number with full decimals, thousands separator, no abbreviations
function formatNum(num: number, maxDec: number = 4): string {
  if (num === 0 || Number.isNaN(num)) return "0";
  const decimals = num < 0.01 ? 8 : num < 1 ? 6 : maxDec;
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!decPart) return `${formattedInt}.00`;
  const trimmed = decPart.replace(/0+$/, "").padEnd(2, "0");
  return `${formattedInt}.${trimmed}`;
}

export default function TradeCollateralPage() {
  const cardRef = useRef<HTMLDivElement>(null);
  const buyOutputRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const tokenModalBackdropRef = useRef<HTMLDivElement>(null);
  const tokenModalCardRef = useRef<HTMLDivElement>(null);
  const rateDetailsRef = useRef<HTMLDivElement>(null);
  const confirmBackdropRef = useRef<HTMLDivElement>(null);
  const confirmCardRef = useRef<HTMLDivElement>(null);
  const { address: userAddress, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { data: poolAddresses } = useLendingPools();
  const ALL_POOLS: Address[] = (poolAddresses ?? []) as Address[];

  // ── UI state ──
  const [tokenIn, setTokenIn] = useState<TokenInfo>(TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<TokenInfo>(TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [feeTier, setFeeTier] = useState(1000);
  const [selectingFor, setSelectingFor] = useState<"in" | "out" | null>(null);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [rateVisible, setRateVisible] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txStep, setTxStep] = useState<"idle" | "review" | "swapping" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const chainDropdownMenuRef = useRef<HTMLDivElement>(null);
  const chainDropdownWrapperRef = useRef<HTMLDivElement>(null);

  const activeSlippage = customSlippage && Number(customSlippage) > 0 ? Number(customSlippage) : slippage;

  // ── L1: Get routers for all pools ──

  const { data: routerResults } = useReadContracts({
    contracts: ALL_POOLS.map((pool) => ({
      address: pool,
      abi: lendingPoolAbi,
      functionName: "router" as const,
      chainId: CHAIN.id,
    })),
  });

  const routers = useMemo(() => {
    if (!routerResults) return [];
    return routerResults
      .map((r, i) => ({
        pool: ALL_POOLS[i],
        router: r.status === "success" ? (r.result as Address) : null,
      }))
      .filter((r): r is { pool: Address; router: Address } => r.router !== null);
  }, [routerResults]);

  // ── L2: From routers, get collateralToken + addressPositions + factory ──

  const routerContracts = useMemo(() => {
    return routers.flatMap((r) => [
      { address: r.router, abi: lendingPoolRouterAbi, functionName: "collateralToken" as const, chainId: CHAIN.id },
      { address: r.router, abi: lendingPoolRouterAbi, functionName: "factory" as const, chainId: CHAIN.id },
      ...(userAddress
        ? [{ address: r.router, abi: lendingPoolRouterAbi, functionName: "addressPositions" as const, args: [userAddress] as const, chainId: CHAIN.id }]
        : []),
    ]);
  }, [routers, userAddress]);

  const { data: routerDataResults, refetch: refetchRouterData } = useReadContracts({
    contracts: routerContracts,
    query: { enabled: routers.length > 0 },
  });

  const poolData = useMemo(() => {
    if (!routerDataResults || routers.length === 0) return [];
    const perRouter = userAddress ? 3 : 2;
    return routers.map((r, i) => {
      const base = i * perRouter;
      const collateralToken = routerDataResults[base]?.status === "success" ? (routerDataResults[base].result as Address) : null;
      const factory = routerDataResults[base + 1]?.status === "success" ? (routerDataResults[base + 1].result as Address) : null;
      const positionAddr = userAddress && routerDataResults[base + 2]?.status === "success"
        ? (routerDataResults[base + 2].result as Address)
        : null;
      const hasPosition = !!positionAddr && positionAddr !== ZERO_ADDRESS;
      return { ...r, collateralToken, factory, positionAddr, hasPosition };
    });
  }, [routerDataResults, routers, userAddress]);

  const factoryAddr = poolData.find((p) => p.factory)?.factory ?? null;

  // ── L3: Get tokenDataStream from factory ──

  const { data: tokenDataStreamAddr } = useReadContract({
    address: factoryAddr!,
    abi: lendingPoolFactoryAbi,
    functionName: "tokenDataStream",
    chainId: CHAIN.id,
    query: { enabled: !!factoryAddr },
  });

  // ── L4: Get prices for all tokens ──

  const { data: priceResults } = useReadContracts({
    contracts: TOKENS.flatMap((token) => [
      { address: tokenDataStreamAddr as Address, abi: tokenDataStreamAbi, functionName: "latestRoundData" as const, args: [token.address] as const, chainId: CHAIN.id },
      { address: tokenDataStreamAddr as Address, abi: tokenDataStreamAbi, functionName: "decimals" as const, args: [token.address] as const, chainId: CHAIN.id },
    ]),
    query: { enabled: !!tokenDataStreamAddr },
  });

  const tokenPrices = useMemo(() => {
    const prices: Record<string, { price: number; raw: bigint; decimals: number }> = {};
    if (!priceResults) return prices;
    TOKENS.forEach((token, i) => {
      const priceData = priceResults[i * 2];
      const decData = priceResults[i * 2 + 1];
      if (priceData?.status === "success" && decData?.status === "success") {
        const roundData = priceData.result as readonly [bigint, bigint, bigint, bigint, bigint];
        const priceDec = Number(decData.result as bigint);
        prices[token.symbol] = {
          price: Number(formatUnits(roundData[1], priceDec)),
          raw: roundData[1],
          decimals: priceDec,
        };
      }
    });
    return prices;
  }, [priceResults]);

  // ── L5: Get position balances for all tokens in all positions ──

  const positionsWithData = useMemo(
    () => poolData.filter((p) => p.hasPosition && p.positionAddr),
    [poolData]
  );

  const { data: positionBalanceResults, refetch: refetchPositionBalances } = useReadContracts({
    contracts: positionsWithData.flatMap((p) =>
      TOKENS.map((token) => ({
        address: token.address,
        abi: mockErc20Abi,
        functionName: "balanceOf" as const,
        args: [p.positionAddr!] as const,
        chainId: CHAIN.id,
      }))
    ),
    query: { enabled: positionsWithData.length > 0 },
  });

  // Map: token symbol → { total balance, per-pool breakdown }
  const positionBalances = useMemo(() => {
    const balances: Record<string, { total: bigint; pools: { pool: Address; balance: bigint }[] }> = {};
    TOKENS.forEach((t) => {
      balances[t.symbol] = { total: 0n, pools: [] };
    });
    if (!positionBalanceResults) return balances;
    positionsWithData.forEach((p, pi) => {
      TOKENS.forEach((token, ti) => {
        const idx = pi * TOKENS.length + ti;
        const result = positionBalanceResults[idx];
        if (result?.status === "success") {
          const bal = result.result as bigint;
          if (bal > 0n) {
            balances[token.symbol].total += bal;
            balances[token.symbol].pools.push({ pool: p.pool, balance: bal });
          }
        }
      });
    });
    return balances;
  }, [positionBalanceResults, positionsWithData]);

  // Find pool to use for swap (highest balance for tokenIn)
  const swapPool = useMemo(() => {
    const pools = positionBalances[tokenIn.symbol]?.pools ?? [];
    if (pools.length === 0) return null;
    return pools.reduce((best, p) => (p.balance > best.balance ? p : best));
  }, [positionBalances, tokenIn.symbol]);

  const positionBalance = positionBalances[tokenIn.symbol]?.total ?? 0n;
  const positionBalanceNum = Number(formatUnits(positionBalance, tokenIn.decimals));

  // ── Computed values ──

  const estimatedOutput = useMemo(() => {
    if (!amountIn || Number(amountIn) <= 0) return 0;
    const priceIn = tokenPrices[tokenIn.symbol]?.price;
    const priceOut = tokenPrices[tokenOut.symbol]?.price;
    if (!priceIn || !priceOut || priceOut === 0) return 0;
    return (Number(amountIn) * priceIn) / priceOut;
  }, [amountIn, tokenIn.symbol, tokenOut.symbol, tokenPrices]);

  const rate = useMemo(() => {
    const priceIn = tokenPrices[tokenIn.symbol]?.price;
    const priceOut = tokenPrices[tokenOut.symbol]?.price;
    if (!priceIn || !priceOut || priceOut === 0) return 0;
    return priceIn / priceOut;
  }, [tokenIn.symbol, tokenOut.symbol, tokenPrices]);

  const minAmountOut = useMemo(() => {
    if (estimatedOutput <= 0) return 0n;
    const minOut = estimatedOutput * (1 - activeSlippage / 100);
    return parseUnits(minOut.toFixed(tokenOut.decimals), tokenOut.decimals);
  }, [estimatedOutput, activeSlippage, tokenOut.decimals]);

  const inputUsdValue = useMemo(() => {
    if (!amountIn || Number(amountIn) <= 0) return 0;
    return Number(amountIn) * (tokenPrices[tokenIn.symbol]?.price ?? 0);
  }, [amountIn, tokenIn.symbol, tokenPrices]);

  const outputUsdValue = useMemo(() => {
    if (estimatedOutput <= 0) return 0;
    return estimatedOutput * (tokenPrices[tokenOut.symbol]?.price ?? 0);
  }, [estimatedOutput, tokenOut.symbol, tokenPrices]);

  // ── Write hooks ──

  const { writeContract, data: swapTxHash, reset: resetSwap } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: swapConfirmed } = useWaitForTransactionReceipt({ hash: swapTxHash });

  useEffect(() => {
    if (swapConfirmed && txStep === "swapping") {
      setTxStep("success");
      setAmountIn("");
      refetchPositionBalances();
      refetchRouterData();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
    }
  }, [swapConfirmed, txStep, refetchPositionBalances, refetchRouterData, queryClient]);

  const handleReview = useCallback(() => {
    if (!swapPool || !amountIn || Number(amountIn) <= 0) return;
    setErrorMsg("");
    const amount = parseUnits(amountIn, tokenIn.decimals);
    if (amount > positionBalance) {
      setErrorMsg("Insufficient position balance");
      return;
    }
    setTxStep("review");
    setShowConfirmModal(true);
  }, [swapPool, amountIn, tokenIn.decimals, positionBalance]);

  const confirmSwap = useCallback(() => {
    if (!swapPool || !amountIn || Number(amountIn) <= 0) return;
    const amount = parseUnits(amountIn, tokenIn.decimals);
    setTxStep("swapping");
    writeContract(
      {
        address: swapPool.pool,
        abi: lendingPoolAbi,
        functionName: "swapTokenByPosition",
        args: [
          {
            v0: tokenIn.address,
            v1: tokenOut.address,
            v2: amount,
            v3: 0n,
            v4: feeTier,
          },
        ],
        chainId: CHAIN.id,
      },
      {
        onError: (err: Error) => {
          setTxStep("error");
          setErrorMsg(err.message.split("\n")[0]);
        },
      }
    );
  }, [swapPool, amountIn, tokenIn, tokenOut, feeTier, writeContract]);

  const handleFlip = () => {
    const prev = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(prev);
    setAmountIn("");
  };

  const openTokenModal = (side: "in" | "out") => {
    setSelectingFor(side);
    setTokenModalVisible(true);
  };

  const closeTokenModal = useCallback(() => {
    const backdrop = tokenModalBackdropRef.current;
    const card = tokenModalCardRef.current;
    if (!backdrop || !card) {
      setSelectingFor(null);
      setTokenModalVisible(false);
      return;
    }
    const tl = gsap.timeline({
      onComplete: () => {
        setSelectingFor(null);
        setTokenModalVisible(false);
      },
    });
    tl.to(card, { opacity: 0, scale: 0.92, y: 20, duration: 0.22, ease: "power3.in" }, 0);
    tl.to(backdrop, { opacity: 0, duration: 0.22, ease: "power2.in" }, 0.05);
  }, []);

  const handleSelectToken = (token: TokenInfo) => {
    if (selectingFor === "in") {
      if (token.symbol === tokenOut.symbol) setTokenOut(tokenIn);
      setTokenIn(token);
    } else {
      if (token.symbol === tokenIn.symbol) setTokenIn(tokenOut);
      setTokenOut(token);
    }
    closeTokenModal();
    setAmountIn("");
  };

  const handleSetMax = () => {
    if (positionBalance > 0n) {
      setAmountIn(formatUnits(positionBalance, tokenIn.decimals));
    }
  };

  const closeConfirmModal = useCallback(() => {
    const backdrop = confirmBackdropRef.current;
    const card = confirmCardRef.current;
    if (!backdrop || !card) {
      setShowConfirmModal(false);
      setTxStep("idle");
      setErrorMsg("");
      resetSwap();
      return;
    }
    const tl = gsap.timeline({
      onComplete: () => {
        setShowConfirmModal(false);
        setTxStep("idle");
        setErrorMsg("");
        resetSwap();
        if (txStep === "success") setAmountIn("");
      },
    });
    tl.to(card, { opacity: 0, scale: 0.92, y: 20, duration: 0.22, ease: "power3.in" }, 0);
    tl.to(backdrop, { opacity: 0, duration: 0.22, ease: "power2.in" }, 0.05);
  }, [resetSwap, txStep]);

  // ── Button state ──

  const buttonState = useMemo(() => {
    if (txStep !== "idle" && txStep !== "error") return { text: "Review Swap", disabled: true };
    if (!amountIn || Number(amountIn) <= 0) return { text: "Enter an amount", disabled: true };
    if (positionBalance === 0n) return { text: "No position balance", disabled: true };
    try {
      const amount = parseUnits(amountIn, tokenIn.decimals);
      if (amount > positionBalance) return { text: "Insufficient balance", disabled: true };
    } catch {
      return { text: "Invalid amount", disabled: true };
    }
    if (!swapPool) return { text: "No eligible pool", disabled: true };
    return { text: "Review Swap", disabled: false };
  }, [txStep, amountIn, positionBalance, tokenIn.decimals, swapPool]);

  // ── GSAP animation ──

  useEffect(() => {
    if (cardRef.current) {
      gsap.set(cardRef.current, { opacity: 0, y: 20 });
      gsap.to(cardRef.current, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", delay: 0.2 });
    }
  }, []);

  // Animate Buy output digits one by one when value changes
  const prevOutputStr = useRef("");
  useEffect(() => {
    if (!buyOutputRef.current) return;
    const chars = buyOutputRef.current.querySelectorAll<HTMLElement>(".digit-char");
    if (!chars.length) return;
    const outputStr = estimatedOutput > 0
      ? formatNum(estimatedOutput, Math.min(tokenOut.decimals, 8))
      : "0";
    if (outputStr === prevOutputStr.current) return;
    prevOutputStr.current = outputStr;
    gsap.fromTo(chars,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.25, stagger: 0.03, ease: "power2.out" }
    );
  }, [estimatedOutput, tokenOut.decimals]);

  // Animate settings panel in/out
  useEffect(() => {
    if (showSettings) {
      setSettingsVisible(true);
    } else if (settingsRef.current) {
      const el = settingsRef.current;
      gsap.to(el, {
        opacity: 0, height: 0, marginBottom: 0, duration: 0.25, ease: "power3.in",
        onComplete: () => setSettingsVisible(false),
      });
    }
  }, [showSettings]);

  useEffect(() => {
    if (!settingsVisible || !settingsRef.current) return;
    const el = settingsRef.current;
    gsap.fromTo(el,
      { opacity: 0, height: 0, marginBottom: 0 },
      { opacity: 1, height: "auto", marginBottom: 16, duration: 0.35, ease: "power3.out" }
    );
    const children = el.children;
    if (children.length) {
      gsap.fromTo(children,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: "power2.out", delay: 0.1 }
      );
    }
  }, [settingsVisible]);

  // Animate rate details in/out
  const showRate = rate > 0 && !!amountIn && Number(amountIn) > 0;
  useEffect(() => {
    if (showRate) {
      setRateVisible(true);
    } else if (rateDetailsRef.current) {
      const el = rateDetailsRef.current;
      gsap.to(el, {
        opacity: 0, height: 0, marginTop: 0, duration: 0.25, ease: "power3.in",
        onComplete: () => setRateVisible(false),
      });
    }
  }, [showRate]);

  useEffect(() => {
    if (!rateVisible || !rateDetailsRef.current) return;
    const el = rateDetailsRef.current;
    gsap.fromTo(el,
      { opacity: 0, height: 0, marginTop: 0 },
      { opacity: 1, height: "auto", marginTop: 12, duration: 0.35, ease: "power3.out" }
    );
    const children = el.children;
    if (children.length) {
      gsap.fromTo(children,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: "power2.out", delay: 0.1 }
      );
    }
  }, [rateVisible]);

  // Animate confirm modal in
  useEffect(() => {
    if (!showConfirmModal || !confirmBackdropRef.current || !confirmCardRef.current) return;
    const backdrop = confirmBackdropRef.current;
    const card = confirmCardRef.current;
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
    gsap.fromTo(card, { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "power3.out" });
  }, [showConfirmModal]);

  // Animate confirm modal content on txStep change
  useEffect(() => {
    if (!showConfirmModal || !confirmCardRef.current) return;
    const rows = confirmCardRef.current.querySelectorAll<HTMLElement>(".modal-row");
    if (rows.length) {
      gsap.fromTo(rows, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, ease: "power2.out" });
    }
  }, [txStep, showConfirmModal]);

  // Animate token modal in
  useEffect(() => {
    if (!tokenModalVisible || !tokenModalBackdropRef.current || !tokenModalCardRef.current) return;
    const backdrop = tokenModalBackdropRef.current;
    const card = tokenModalCardRef.current;
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
    gsap.fromTo(card, { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "power3.out" });
    const rows = card.querySelectorAll<HTMLElement>(".token-row");
    if (rows.length) {
      gsap.fromTo(rows, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.04, ease: "power2.out", delay: 0.1 });
    }
  }, [tokenModalVisible]);

  // Chain dropdown: GSAP animation
  useEffect(() => {
    const el = chainDropdownMenuRef.current;
    if (!el) return;
    if (chainDropdownOpen) {
      gsap.fromTo(el,
        { scaleY: 0, opacity: 0, transformOrigin: "top center" },
        { scaleY: 1, opacity: 1, duration: 0.25, ease: "back.out(1.4)" }
      );
    }
  }, [chainDropdownOpen]);

  // Chain dropdown: close on outside click
  useEffect(() => {
    if (!chainDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (chainDropdownWrapperRef.current && !chainDropdownWrapperRef.current.contains(e.target as Node)) {
        setChainDropdownOpen(false);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [chainDropdownOpen]);

  // ── Render ──

  return (
    <div className="flex justify-center pt-4">
      <div ref={cardRef} className="w-full max-w-[480px]">
        <div className="bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            {/* Chain selector */}
            <div ref={chainDropdownWrapperRef} className="relative">
              <button
                onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.1] hover:border-white/[0.2] bg-white/[0.04] transition-all cursor-pointer"
              >
                <Image src="/chains/arbitrum-logo.png" alt="Arbitrum" width={20} height={20} className="rounded-full" />
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none"
                  className={`text-[var(--text-tertiary)] transition-transform duration-200 ${chainDropdownOpen ? "rotate-180" : ""}`}
                >
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {chainDropdownOpen && (
                <div
                  ref={chainDropdownMenuRef}
                  className="absolute z-50 top-[calc(100%+6px)] left-0 w-52 bg-[rgba(8,12,28,0.85)] backdrop-blur-md border border-white/[0.08] rounded-lg shadow-xl overflow-hidden"
                >
                  {[
                    { name: "Arbitrum Sepolia", logo: "/chains/arbitrum-logo.png", active: true },
                    { name: "Base", logo: "/chains/base-logo.png", soon: true },
                    { name: "Hyperliquid", logo: "/chains/hyperliquid-logo.png", soon: true },
                    { name: "MegaETH", logo: "/chains/megaeth.png", soon: true },
                  ].map((chain) => (
                    <button
                      key={chain.name}
                      disabled={chain.soon}
                      onClick={() => { if (!chain.soon) setChainDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                        chain.soon
                          ? "opacity-50 cursor-not-allowed"
                          : chain.active
                          ? "bg-blue-500/10 text-blue-400 cursor-pointer"
                          : "text-[var(--text-primary)] hover:bg-white/[0.05] cursor-pointer"
                      }`}
                    >
                      <Image src={chain.logo} alt={chain.name} width={20} height={20} className="rounded-full shrink-0" />
                      <span className="flex-1 text-left">{chain.name}</span>
                      {chain.soon && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400">Soon</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
              title="Settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--text-tertiary)]">
                <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {/* Settings panel */}
          {settingsVisible && (
            <div ref={settingsRef} className="p-4 bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl space-y-4 overflow-hidden">
              <div>
                <div className="text-xs font-medium text-[var(--text-tertiary)] mb-2">Slippage Tolerance</div>
                <div className="flex gap-2">
                  {[0.1, 0.5, 1.0].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSlippage(s); setCustomSlippage(""); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        !customSlippage && slippage === s
                          ? "bg-[var(--accent)] text-[var(--bg-primary)]"
                          : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Custom"
                      value={customSlippage}
                      onChange={(e) => {
                        if (/^\d*\.?\d*$/.test(e.target.value)) setCustomSlippage(e.target.value);
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] pr-6"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">%</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-[var(--text-tertiary)] mb-2">Fee Tier</div>
                <div className="flex gap-2">
                  {FEE_TIERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFeeTier(f.value)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        feeTier === f.value
                          ? "bg-[var(--accent)] text-[var(--bg-primary)]"
                          : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Form (always visible) ── */}
          <>
            {/* ── You Pay ── */}
            <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-2xl p-4 mb-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-tertiary)]">Sell</span>
                {isConnected && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Your Collateral: {formatNum(positionBalanceNum, 4)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amountIn}
                  onChange={(e) => {
                    if (/^\d*\.?\d*$/.test(e.target.value)) setAmountIn(e.target.value);
                  }}
                  className="flex-1 bg-transparent outline-none text-3xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] min-w-0"
                />
                <button
                  onClick={() => openTokenModal("in")}
                  className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--bg-tertiary)] hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
                >
                  <TokenIcon symbol={tokenIn.symbol} color={tokenIn.color} size={24} />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{tokenIn.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[var(--text-tertiary)]">
                    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[var(--text-tertiary)]">
                  {inputUsdValue > 0 ? `$${formatNum(inputUsdValue, 2)}` : ""}
                </span>
                {isConnected && positionBalance > 0n && (
                  <button
                    onClick={handleSetMax}
                    className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-light)] cursor-pointer"
                  >
                    MAX
                  </button>
                )}
              </div>
            </div>

            {/* ── Swap direction button ── */}
            <div className="flex justify-center -my-3 relative z-10">
              <button
                onClick={handleFlip}
                className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border-4 border-[var(--bg-primary)] hover:border-[var(--border-hover)] flex items-center justify-center transition-all hover:rotate-180 duration-300 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--text-secondary)]">
                  <path d="M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* ── You Receive ── */}
            <div className="bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-2xl p-4 mt-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-tertiary)]">Buy</span>
              </div>
              <div className="flex items-center gap-3">
                <div ref={buyOutputRef} className="flex-1 text-3xl font-semibold min-w-0 truncate" style={{ color: estimatedOutput > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                  {(estimatedOutput > 0
                    ? formatNum(estimatedOutput, Math.min(tokenOut.decimals, 8))
                    : "0"
                  ).split("").map((ch, i) => (
                    <span key={`${ch}-${i}`} className="digit-char inline-block">{ch}</span>
                  ))}
                </div>
                <button
                  onClick={() => openTokenModal("out")}
                  className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--bg-tertiary)] hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
                >
                  <TokenIcon symbol={tokenOut.symbol} color={tokenOut.color} size={24} />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{tokenOut.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[var(--text-tertiary)]">
                    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="mt-2">
                <span className="text-xs text-[var(--text-tertiary)]">
                  {outputUsdValue > 0 ? `$${formatNum(outputUsdValue, 2)}` : ""}
                </span>
              </div>
            </div>

            {/* ── Rate & details ── */}
            {rateVisible && (
              <div ref={rateDetailsRef} className="p-3.5 bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl space-y-2.5 overflow-hidden">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-tertiary)]">Rate</span>
                  <span className="text-[var(--text-secondary)]">
                    1 {tokenIn.symbol} = {formatNum(rate, 4)} {tokenOut.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-tertiary)]">Slippage Tolerance</span>
                  <span className="text-[var(--text-secondary)]">{activeSlippage}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-tertiary)]">Min. Received</span>
                  <span className="text-[var(--text-secondary)]">
                    {formatNum(estimatedOutput * (1 - activeSlippage / 100), Math.min(tokenOut.decimals, 8))} {tokenOut.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-tertiary)]">Fee Tier</span>
                  <span className="text-[var(--text-secondary)]">
                    {FEE_TIERS.find((f) => f.value === feeTier)?.label}
                  </span>
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {errorMsg && txStep === "idle" && (
              <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {errorMsg}
              </div>
            )}

            {/* ── Action button ── */}
            <div className="mt-4">
              {!isConnected ? (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      onClick={openConnectModal}
                      className="w-full py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              ) : (
                <button
                  onClick={handleReview}
                  disabled={buttonState.disabled}
                  className="w-full py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {buttonState.text}
                </button>
              )}
            </div>
          </>
        </div>

      </div>

      {/* ── Confirm Modal (Review / Loading / Done) ── */}
      {showConfirmModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            ref={confirmBackdropRef}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (txStep === "review" || txStep === "success") closeConfirmModal(); }}
          />
          <div ref={confirmCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {txStep === "success" ? "Transaction Successful" : txStep === "swapping" ? "Confirm" : "Review Swap"}
              </h3>
              {(txStep === "review" || txStep === "success" || txStep === "error") && (
                <button
                  onClick={closeConfirmModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* ── Review ── */}
              {txStep === "review" && (
                <>
                  <div className="modal-row bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-xs text-[var(--text-tertiary)] mb-2">You Sell</div>
                    <div className="flex items-center gap-2.5">
                      <TokenIcon symbol={tokenIn.symbol} color={tokenIn.color} size={32} />
                      <div>
                        <div className="text-lg font-semibold text-[var(--text-primary)]">{amountIn} {tokenIn.symbol}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">${formatNum(inputUsdValue, 2)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center -my-2 relative z-10">
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border-2 border-white/[0.06] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--text-tertiary)]">
                        <path d="M7 3v8M7 11l-3-3M7 11l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  <div className="modal-row bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-xs text-[var(--text-tertiary)] mb-2">You Receive</div>
                    <div className="flex items-center gap-2.5">
                      <TokenIcon symbol={tokenOut.symbol} color={tokenOut.color} size={32} />
                      <div>
                        <div className="text-lg font-semibold text-[var(--text-primary)]">~{formatNum(estimatedOutput, Math.min(tokenOut.decimals, 8))} {tokenOut.symbol}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">${formatNum(outputUsdValue, 2)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="modal-row bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Rate</span>
                      <span className="text-[var(--text-secondary)]">1 {tokenIn.symbol} = {formatNum(rate, 4)} {tokenOut.symbol}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Slippage Tolerance</span>
                      <span className="text-[var(--text-secondary)]">{activeSlippage}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Min. Received</span>
                      <span className="text-[var(--text-secondary)]">{formatNum(estimatedOutput * (1 - activeSlippage / 100), Math.min(tokenOut.decimals, 8))} {tokenOut.symbol}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Fee Tier</span>
                      <span className="text-[var(--text-secondary)]">{FEE_TIERS.find((f) => f.value === feeTier)?.label}</span>
                    </div>
                  </div>

                  <button
                    onClick={confirmSwap}
                    className="modal-row w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Confirm Swap
                  </button>
                </>
              )}

              {/* ── Loading / Confirming ── */}
              {txStep === "swapping" && (
                <div className="space-y-4">
                  {/* Swap summary */}
                  <div className="modal-row bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <TokenIcon symbol={tokenIn.symbol} color={tokenIn.color} size={28} />
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{amountIn} {tokenIn.symbol}</div>
                          <div className="text-xs text-[var(--text-tertiary)]">${formatNum(inputUsdValue, 2)}</div>
                        </div>
                      </div>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--text-tertiary)] mx-2">
                        <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex items-center gap-2.5">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-[var(--text-primary)]">~{formatNum(estimatedOutput, 2)} {tokenOut.symbol}</div>
                          <div className="text-xs text-[var(--text-tertiary)]">${formatNum(outputUsdValue, 2)}</div>
                        </div>
                        <TokenIcon symbol={tokenOut.symbol} color={tokenOut.color} size={28} />
                      </div>
                    </div>
                  </div>

                  {/* Tx hash */}
                  {swapTxHash && (
                    <div className="modal-row flex items-center justify-between">
                      <span className="text-xs text-[var(--text-tertiary)]">Swap Collateral</span>
                      <a
                        href={`${CHAIN.blockExplorers?.default.url}/tx/${swapTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                      >
                        {(swapTxHash as string).slice(0, 6)}...{(swapTxHash as string).slice(-4)}
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    </div>
                  )}

                  {/* Progress bar */}
                  <div className="modal-row w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] rounded-full animate-pulse"
                      style={{ width: isConfirming ? "70%" : "35%", transition: "width 1.5s ease-in-out" }}
                    />
                  </div>

                  {/* Status message */}
                  <div className="modal-row flex items-center justify-center gap-2 py-2">
                    <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {isConfirming ? "Confirming transaction..." : "Proceed in your wallet"}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Error inside modal ── */}
              {txStep === "error" && (
                <div className="space-y-4">
                  <div className="modal-row p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {errorMsg || "Transaction failed. Please try again."}
                  </div>
                  <button
                    onClick={() => { setTxStep("review"); setErrorMsg(""); resetSwap(); }}
                    className="modal-row w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* ── Done ── */}
              {txStep === "success" && (
                <div className="space-y-4">
                  <div className="modal-row flex flex-col items-center py-4">
                    <div className="mb-3">
                      <AnimatedCheckmark />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">Collateral swapped successfully</p>
                  </div>

                  <div className="modal-row bg-[rgba(8,12,28,0.5)] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Sold</span>
                      <div className="flex items-center gap-1.5">
                        <TokenIcon symbol={tokenIn.symbol} color={tokenIn.color} size={18} />
                        <span className="text-[var(--text-primary)] font-medium">{amountIn} {tokenIn.symbol}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Received</span>
                      <div className="flex items-center gap-1.5">
                        <TokenIcon symbol={tokenOut.symbol} color={tokenOut.color} size={18} />
                        <span className="text-[var(--text-primary)] font-medium">~{formatNum(estimatedOutput, Math.min(tokenOut.decimals, 4))} {tokenOut.symbol}</span>
                      </div>
                    </div>
                  </div>

                  {swapTxHash && (
                    <div className="modal-row flex items-center justify-center">
                      <a
                        href={`${CHAIN.blockExplorers?.default.url}/tx/${swapTxHash}`}
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
                    onClick={closeConfirmModal}
                    className="modal-row w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Token Selector Modal ── */}
      {selectingFor && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            ref={tokenModalBackdropRef}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeTokenModal}
          />
          <div ref={tokenModalCardRef} className="relative bg-[rgba(8,12,28,0.65)] backdrop-blur-md border border-white/[0.08] rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Select Token</h3>
              <button
                onClick={closeTokenModal}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-2 max-h-[320px] overflow-y-auto">
              {TOKENS.map((token) => {
                const isSelected =
                  selectingFor === "in"
                    ? token.symbol === tokenIn.symbol
                    : token.symbol === tokenOut.symbol;
                const bal = positionBalances[token.symbol]?.total ?? 0n;
                const balNum = Number(formatUnits(bal, token.decimals));

                return (
                  <button
                    key={token.symbol}
                    onClick={() => handleSelectToken(token)}
                    disabled={isSelected}
                    className={`token-row w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      isSelected
                        ? "bg-[var(--accent-glow)] cursor-default"
                        : "hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    }`}
                  >
                    <TokenIcon symbol={token.symbol} color={token.color} size={36} />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {token.symbol}
                        {isSelected && (
                          <span className="ml-2 text-xs font-normal text-[var(--accent)]">Selected</span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)]">{token.name}</div>
                    </div>
                    {isConnected && bal > 0n && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-[var(--text-secondary)]">
                          {formatNum(balNum, 4)}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
