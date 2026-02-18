"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { parseUnits, formatUnits, maxUint256, encodePacked } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import TokenIcon from "@/components/TokenIcon";
import { lendingPoolAbi } from "@/lib/abis/lending-pool-abi";
import { lendingPoolRouterAbi } from "@/lib/abis/lending-pool-router-abi";
import { lendingPoolFactoryAbi } from "@/lib/abis/lending-pool-factory-abi";
import { interestRateModelAbi } from "@/lib/abis/interest-rate-model-abi";
import { mockErc20Abi } from "@/lib/abis/mock-erc20-abi";
import { tokenDataStreamAbi } from "@/lib/abis/token-data-stream-abi";
import { multicallAbi } from "@/lib/abis/multicall-abi";
import { oftAdapterAbi } from "@/lib/abis/oft-adapter-abi";
import { CHAIN, MULTICALL_ADDRESS, BASE_SEPOLIA_TOKENS } from "@/lib/contracts";
import { gsap } from "@/hooks/useGsap";

// LayerZero V3 extraOptions: executor lzReceive with 200k gas
const LZ_GAS_OPTION = 200_000n;
const LZ_EXTRA_OPTIONS = encodePacked(
  ["uint16", "uint8", "uint16", "uint8", "uint128"],
  [3, 1, 17, 1, LZ_GAS_OPTION]
);

interface DestChain {
  name: string;
  eid: number;
  logo: string;
}

const DEST_CHAINS: DestChain[] = [
  { name: "Base Sepolia", eid: 40245, logo: "/chains/base-logo.png" },
];

const TOKEN_COLORS: Record<string, string> = {
  ETH: "#627eea", WETH: "#627eea", WBTC: "#f7931a", USDC: "#2775ca",
  USDT: "#26a17b", DAI: "#f5ac37", ARB: "#28a0f0", LINK: "#2a5ada",
};

// All known collateral tokens on Arbitrum Sepolia (for multi-token position reading)
const KNOWN_COLLATERAL_TOKENS = [
  { symbol: "WETH", address: "0x48b3f901d040796f9cda37469fc5436fca711366" as `0x${string}`, decimals: 18 },
  { symbol: "USDC", address: "0x5602a3f9b8a935df32871bb1c6289f24620233f7" as `0x${string}`, decimals: 6 },
  { symbol: "USDT", address: "0x21483bcde6e19fdb5acc1375c443ebb17147a69a" as `0x${string}`, decimals: 6 },
  { symbol: "WBTC", address: "0xacbc1ce1908b9434222e60d6cfed9e011a386220" as `0x${string}`, decimals: 8 },
];

interface PositionCollateral {
  symbol: string;
  decimals: number;
  amount: bigint;
  usd: number;
}

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "position">("overview");
  const [sidebarTab, setSidebarTab] = useState<"collateral" | "borrow" | "repay">("collateral");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [crossChainEnabled, setCrossChainEnabled] = useState(false);
  const [destChain, setDestChain] = useState<DestChain | null>(null);
  const isCrossChain = crossChainEnabled;
  const [txStep, setTxStep] = useState<"idle" | "approving" | "supplying-collateral" | "borrowing" | "borrowing-crosschain" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [repayLoanAmount, setRepayLoanAmount] = useState("");
  const [rlTxStep, setRlTxStep] = useState<"idle" | "approving" | "repaying" | "success" | "error">("idle");
  const [rlErrorMsg, setRlErrorMsg] = useState("");
  const [withdrawColAmount, setWithdrawColAmount] = useState("");
  const [wcTxStep, setWcTxStep] = useState<"idle" | "withdrawing" | "success" | "error">("idle");
  const [wcErrorMsg, setWcErrorMsg] = useState("");

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const collateralFormRef = useRef<HTMLDivElement>(null);
  const borrowFormRef = useRef<HTMLDivElement>(null);
  const repayFormRef = useRef<HTMLDivElement>(null);
  const chainDropdownRef = useRef<HTMLDivElement>(null);
  const colModalBackdropRef = useRef<HTMLDivElement>(null);
  const colModalCardRef = useRef<HTMLDivElement>(null);
  const colModalContentRef = useRef<HTMLDivElement>(null);
  const borModalBackdropRef = useRef<HTMLDivElement>(null);
  const borModalCardRef = useRef<HTMLDivElement>(null);
  const borModalContentRef = useRef<HTMLDivElement>(null);

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
    query: { enabled: !!routerAddress, refetchInterval: 5_000 },
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

  const { data: userBorrowShares, refetch: refetchBorrowShares } = useReadContract({
    address: routerAddress as `0x${string}`,
    abi: lendingPoolRouterAbi,
    functionName: "userBorrowShares",
    args: [userAddress!],
    chainId: CHAIN.id,
    query: { enabled: !!routerAddress && !!userAddress, refetchInterval: 5_000 },
  });

  const hasPosition = userPositionAddr && userPositionAddr !== "0x0000000000000000000000000000000000000000";

  // Collateral balance = collateral token balance held by position contract
  const { data: positionCollateralBalance, refetch: refetchCollateral } = useReadContract({
    address: collateralTokenAddr,
    abi: mockErc20Abi,
    functionName: "balanceOf",
    args: [userPositionAddr!],
    chainId: CHAIN.id,
    query: { enabled: !!collateralTokenAddr && !!hasPosition, refetchInterval: 5_000 },
  });

  // User wallet balances
  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "balanceOf", args: [userAddress!], chainId: CHAIN.id },
      { address: collateralTokenAddr, abi: mockErc20Abi, functionName: "allowance", args: [userAddress!, lendingPoolAddr], chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "balanceOf", args: [userAddress!], chainId: CHAIN.id },
      { address: borrowTokenAddr, abi: mockErc20Abi, functionName: "allowance", args: [userAddress!, lendingPoolAddr], chainId: CHAIN.id },
    ],
    query: { enabled: !!collateralTokenAddr && !!borrowTokenAddr && !!userAddress, refetchInterval: 5_000 },
  });

  const walletCollateralBalance = (userData?.[0]?.result as bigint) ?? 0n;
  const collateralAllowance = (userData?.[1]?.result as bigint) ?? 0n;
  const walletBorrowBalance = (userData?.[2]?.result as bigint) ?? 0n;
  const borrowTokenAllowance = (userData?.[3]?.result as bigint) ?? 0n;

  // ── All collateral token balances on position contract ──
  const arbClient = usePublicClient({ chainId: CHAIN.id });

  const { data: allCollaterals, refetch: refetchAllCollaterals } = useQuery<PositionCollateral[]>({
    queryKey: ["positionCollaterals", lendingPoolAddr, userPositionAddr],
    queryFn: async () => {
      if (!arbClient || !userPositionAddr || !tokenDataStreamAddr) return [];
      const items: PositionCollateral[] = [];
      for (const token of KNOWN_COLLATERAL_TOKENS) {
        const balance = (await arbClient.readContract({
          address: token.address,
          abi: mockErc20Abi,
          functionName: "balanceOf",
          args: [userPositionAddr],
        })) as bigint;
        if (balance > 0n) {
          let usd = 0;
          try {
            const [priceRound, priceDec] = await Promise.all([
              arbClient.readContract({ address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "latestRoundData", args: [token.address] }),
              arbClient.readContract({ address: tokenDataStreamAddr, abi: tokenDataStreamAbi, functionName: "decimals", args: [token.address] }),
            ]) as [readonly [bigint, bigint, bigint, bigint, bigint], bigint];
            usd = Number(formatUnits(balance, token.decimals)) * Number(formatUnits(priceRound[1], Number(priceDec)));
          } catch { /* price unavailable */ }
          items.push({ symbol: token.symbol, decimals: token.decimals, amount: balance, usd });
        }
      }
      return items;
    },
    enabled: !!arbClient && !!hasPosition && !!tokenDataStreamAddr,
    staleTime: 0,
    refetchInterval: 5_000,
  });

  // ── Cross-chain loan balance (Base Sepolia) ──
  const baseClient = usePublicClient({ chainId: baseSepolia.id });
  const baseToken = BASE_SEPOLIA_TOKENS.find((t) => t.symbol === borrowSymbol);

  const { data: crossChainLoanBalance } = useQuery<bigint>({
    queryKey: ["crossChainLoan", lendingPoolAddr, userAddress, borrowSymbol],
    queryFn: async () => {
      if (!baseClient || !userAddress || !baseToken) return 0n;
      return (await baseClient.readContract({
        address: baseToken.address,
        abi: mockErc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      })) as bigint;
    },
    enabled: !!baseClient && !!userAddress && !!baseToken,
    staleTime: 0,
    refetchInterval: 5_000,
  });

  const crossChainLoanAmount = crossChainLoanBalance ?? 0n;

  // ── Cross-chain borrow reads ──

  // OFT adapter for the borrow token
  const { data: oftAdapterAddr } = useReadContract({
    address: factoryAddr,
    abi: lendingPoolFactoryAbi,
    functionName: "oftAddress",
    args: [borrowTokenAddr!],
    chainId: CHAIN.id,
    query: { enabled: !!factoryAddr && !!borrowTokenAddr },
  });

  const oftConfigured = oftAdapterAddr && oftAdapterAddr !== "0x0000000000000000000000000000000000000000";

  // Build SendParam for quote
  const crossChainParsedAmount = useMemo(() => {
    if (!isCrossChain || !borrowAmount || Number(borrowAmount) <= 0) return 0n;
    try { return parseUnits(borrowAmount, borrowDecimals); } catch { return 0n; }
  }, [isCrossChain, borrowAmount, borrowDecimals]);

  const toBytes32 = useMemo((): `0x${string}` => {
    if (!userAddress) return `0x${"0".repeat(64)}` as `0x${string}`;
    return `0x${userAddress.slice(2).padStart(64, "0")}` as `0x${string}`;
  }, [userAddress]);

  const crossChainSendParam = useMemo(() => ({
    dstEid: destChain?.eid ?? 0,
    to: toBytes32,
    amountLD: crossChainParsedAmount,
    minAmountLD: 0n,
    extraOptions: LZ_EXTRA_OPTIONS,
    composeMsg: "0x" as `0x${string}`,
    oftCmd: "0x" as `0x${string}`,
  }), [destChain?.eid, toBytes32, crossChainParsedAmount]);

  // Quote LayerZero fee
  const { data: quoteFee } = useReadContract({
    address: oftAdapterAddr as `0x${string}`,
    abi: oftAdapterAbi,
    functionName: "quoteSend",
    args: [crossChainSendParam, false],
    chainId: CHAIN.id,
    query: {
      enabled: isCrossChain && !!oftConfigured && !!destChain?.eid && crossChainParsedAmount > 0n && !!userAddress,
    },
  });

  const lzNativeFee = (quoteFee as { nativeFee: bigint; lzTokenFee: bigint } | undefined)?.nativeFee ?? 0n;
  const lzTokenFee = (quoteFee as { nativeFee: bigint; lzTokenFee: bigint } | undefined)?.lzTokenFee ?? 0n;

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
  const { writeContract: writeCrossChain, data: crossChainTxHash, reset: resetCrossChain } = useWriteContract();

  const { writeContract: writeRepayApprove, data: repayApproveTxHash, reset: resetRepayApprove } = useWriteContract();
  const { writeContract: writeRepayLoan, data: repayLoanTxHash, reset: resetRepayLoan } = useWriteContract();
  const { writeContract: writeWithdrawCol, data: withdrawColTxHash, reset: resetWithdrawCol } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: collateralConfirmed } = useWaitForTransactionReceipt({ hash: collateralTxHash });
  const { isSuccess: borrowConfirmed } = useWaitForTransactionReceipt({ hash: borrowTxHash });
  const { isSuccess: crossChainConfirmed, isLoading: crossChainConfirming } = useWaitForTransactionReceipt({ hash: crossChainTxHash });
  const { isSuccess: repayApproveConfirmed } = useWaitForTransactionReceipt({ hash: repayApproveTxHash });
  const { isSuccess: repayLoanConfirmed } = useWaitForTransactionReceipt({ hash: repayLoanTxHash });
  const { isSuccess: withdrawColConfirmed } = useWaitForTransactionReceipt({ hash: withdrawColTxHash });

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
      refetchRouter();
      refetchUser();
      refetchCollateral();
      refetchBorrowShares();
      refetchAllCollaterals();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
      queryClient.invalidateQueries({ queryKey: ["crossChainLoans"] });
    }
  }, [collateralConfirmed, txStep, refetchRouter, refetchUser, refetchCollateral, refetchBorrowShares, refetchAllCollaterals, queryClient]);

  // After borrow confirmed
  useEffect(() => {
    if (borrowConfirmed && txStep === "borrowing") {
      setTxStep("success");
      setBorrowAmount("");
      refetchRouter();
      refetchUser();
      refetchCollateral();
      refetchBorrowShares();
      refetchAllCollaterals();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
      queryClient.invalidateQueries({ queryKey: ["crossChainLoans"] });
    }
  }, [borrowConfirmed, txStep, refetchRouter, refetchUser, refetchCollateral, refetchBorrowShares, refetchAllCollaterals, queryClient]);

  // After cross-chain borrow confirmed
  useEffect(() => {
    if (crossChainConfirmed && txStep === "borrowing-crosschain") {
      setTxStep("success");
      setBorrowAmount("");
      refetchRouter();
      refetchUser();
      refetchCollateral();
      refetchBorrowShares();
      refetchAllCollaterals();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
      queryClient.invalidateQueries({ queryKey: ["crossChainLoans"] });
      queryClient.invalidateQueries({ queryKey: ["crossChainLoan"] });
    }
  }, [crossChainConfirmed, txStep, refetchRouter, refetchUser, refetchCollateral, refetchBorrowShares, refetchAllCollaterals, queryClient]);

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
      setNeedsApproval(true);
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

  const handleCrossChainBorrow = () => {
    if (!userAddress || !borrowAmount || !destChain?.eid) return;
    setErrorMsg("");
    const amount = parseUnits(borrowAmount, borrowDecimals);
    if (amount <= 0n) return;
    if (!oftConfigured) {
      setErrorMsg("OFT adapter not configured for this borrow token");
      return;
    }
    if (lzNativeFee === 0n) {
      setErrorMsg("Unable to estimate LayerZero fee. Try again.");
      return;
    }
    if (liquidity !== undefined && amount > liquidity) {
      setErrorMsg("Exceeds available liquidity");
      return;
    }
    if (amount > maxBorrowable + userBorrowAmount) {
      setErrorMsg("Exceeds maximum borrowable amount based on your collateral and LTV");
      return;
    }
    if (!hasPosition || !positionCollateralBalance || positionCollateralBalance === 0n) {
      setErrorMsg("Supply collateral first before borrowing");
      return;
    }
    setTxStep("borrowing-crosschain");
    writeCrossChain(
      {
        address: MULTICALL_ADDRESS,
        abi: multicallAbi,
        functionName: "borrowDebtCrossChain",
        args: [
          lendingPoolAddr,
          amount,
          crossChainSendParam,
          { nativeFee: lzNativeFee, lzTokenFee },
        ],
        value: lzNativeFee,
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
    setShowConfirmModal(false);
    setShowBorrowModal(false);
    setNeedsApproval(false);
    resetApprove();
    resetCollateral();
    resetBorrow();
    resetCrossChain();
  };

  // ── Repay Loan ──

  // Convert repay amount to borrow shares
  const repaySharesFromAmount = useMemo(() => {
    if (!repayLoanAmount || Number(repayLoanAmount) <= 0) return 0n;
    if (!totalBorrowShares || totalBorrowShares === 0n || !totalBorrowAssets || totalBorrowAssets === 0n) return 0n;
    try {
      const amount = parseUnits(repayLoanAmount, borrowDecimals);
      return (amount * totalBorrowShares) / totalBorrowAssets;
    } catch { return 0n; }
  }, [repayLoanAmount, borrowDecimals, totalBorrowShares, totalBorrowAssets]);

  const doRepayLoanTx = useCallback(() => {
    if (!userAddress || !borrowTokenAddr || repaySharesFromAmount === 0n) return;
    setRlTxStep("repaying");
    writeRepayLoan(
      {
        address: lendingPoolAddr,
        abi: lendingPoolAbi,
        functionName: "repayWithSelectedToken",
        args: [{
          v0: userAddress,
          v1: borrowTokenAddr,
          v2: repaySharesFromAmount,
          v3: 0n,
          v4: false,
          v5: 3000,
        }],
        chainId: CHAIN.id,
      },
      {
        onError: (err) => {
          setRlTxStep("error");
          setRlErrorMsg(err.message.split("\n")[0]);
        },
      }
    );
  }, [userAddress, borrowTokenAddr, repaySharesFromAmount, lendingPoolAddr, writeRepayLoan]);

  // After repay approve confirmed → do repay tx
  useEffect(() => {
    if (repayApproveConfirmed && rlTxStep === "approving") doRepayLoanTx();
  }, [repayApproveConfirmed, rlTxStep, doRepayLoanTx]);

  // After repay loan confirmed
  useEffect(() => {
    if (repayLoanConfirmed && rlTxStep === "repaying") {
      setRlTxStep("success");
      setRepayLoanAmount("");
      refetchRouter();
      refetchUser();
      refetchCollateral();
      refetchBorrowShares();
      refetchAllCollaterals();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
      queryClient.invalidateQueries({ queryKey: ["crossChainLoans"] });
    }
  }, [repayLoanConfirmed, rlTxStep, refetchRouter, refetchUser, refetchCollateral, refetchBorrowShares, refetchAllCollaterals, queryClient]);

  const handleRepayLoan = () => {
    if (!userAddress || !borrowTokenAddr || !repayLoanAmount) return;
    setRlErrorMsg("");
    const amount = parseUnits(repayLoanAmount, borrowDecimals);
    if (amount <= 0n) return;
    if (amount > walletBorrowBalance) {
      setRlErrorMsg("Insufficient wallet balance");
      return;
    }
    if (amount > userBorrowAmount) {
      setRlErrorMsg("Exceeds current loan amount");
      return;
    }
    // Check allowance
    if (borrowTokenAllowance < amount) {
      setRlTxStep("approving");
      writeRepayApprove(
        {
          address: borrowTokenAddr,
          abi: mockErc20Abi,
          functionName: "approve",
          args: [lendingPoolAddr, maxUint256],
          chainId: CHAIN.id,
        },
        {
          onError: (err) => {
            setRlTxStep("error");
            setRlErrorMsg(err.message.split("\n")[0]);
          },
        }
      );
    } else {
      doRepayLoanTx();
    }
  };

  const resetRlTx = () => {
    setRlTxStep("idle");
    setRlErrorMsg("");
    resetRepayApprove();
    resetRepayLoan();
  };

  // ── Withdraw Collateral ──
  useEffect(() => {
    if (withdrawColConfirmed && wcTxStep === "withdrawing") {
      setWcTxStep("success");
      setWithdrawColAmount("");
      refetchRouter();
      refetchUser();
      refetchCollateral();
      refetchBorrowShares();
      refetchAllCollaterals();
      queryClient.invalidateQueries({ queryKey: ["poolData"] });
      queryClient.invalidateQueries({ queryKey: ["userPositions"] });
    }
  }, [withdrawColConfirmed, wcTxStep, refetchRouter, refetchUser, refetchCollateral, refetchBorrowShares, refetchAllCollaterals, queryClient]);

  const handleWithdrawCollateral = () => {
    if (!userAddress || !collateralTokenAddr || !withdrawColAmount) return;
    setWcErrorMsg("");
    const amount = parseUnits(withdrawColAmount, collateralDecimals);
    if (amount <= 0n) return;
    if (positionCollateralBalance && amount > positionCollateralBalance) {
      setWcErrorMsg("Exceeds collateral balance");
      return;
    }
    setWcTxStep("withdrawing");
    writeWithdrawCol(
      {
        address: lendingPoolAddr,
        abi: lendingPoolAbi,
        functionName: "withdrawCollateral",
        args: [amount],
        chainId: CHAIN.id,
      },
      {
        onError: (err) => {
          setWcTxStep("error");
          setWcErrorMsg(err.message.split("\n")[0]);
        },
      }
    );
  };

  const resetWcTx = () => {
    setWcTxStep("idle");
    setWcErrorMsg("");
    resetWithdrawCol();
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

  // Stagger-animate sidebar form children when switching tabs
  useEffect(() => {
    const target = sidebarTab === "borrow"
      ? borrowFormRef.current
      : sidebarTab === "repay"
      ? repayFormRef.current
      : collateralFormRef.current;
    if (!target) return;
    const items = target.children;
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power3.out" }
    );
  }, [sidebarTab]);

  // Animate left panel children when switching overview ↔ position tabs
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!leftRef.current) return;
    const children = leftRef.current.children;
    if (!children.length) return;
    gsap.fromTo(
      children,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power3.out" }
    );
  }, [activeTab]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!chainDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (chainDropdownRef.current && !chainDropdownRef.current.contains(e.target as Node)) {
        setChainDropdownOpen(false);
      }
    };
    // Use setTimeout so the current click event finishes before listener is active
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [chainDropdownOpen]);

  // Modal entrance animations
  useEffect(() => {
    if (!showConfirmModal) return;
    if (colModalBackdropRef.current) {
      gsap.fromTo(colModalBackdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" });
    }
    if (colModalCardRef.current) {
      gsap.fromTo(colModalCardRef.current, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" });
    }
  }, [showConfirmModal]);

  useEffect(() => {
    if (!showBorrowModal) return;
    if (borModalBackdropRef.current) {
      gsap.fromTo(borModalBackdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" });
    }
    if (borModalCardRef.current) {
      gsap.fromTo(borModalCardRef.current, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" });
    }
  }, [showBorrowModal]);

  // Modal phase transition animations
  useEffect(() => {
    if (!showConfirmModal || !colModalContentRef.current) return;
    const children = colModalContentRef.current.children;
    if (children.length) {
      gsap.fromTo(children, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power3.out" });
    }
  }, [txStep, showConfirmModal]);

  useEffect(() => {
    if (!showBorrowModal || !borModalContentRef.current) return;
    const children = borModalContentRef.current.children;
    if (children.length) {
      gsap.fromTo(children, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power3.out" });
    }
  }, [txStep, showBorrowModal]);

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
                      <div className="text-xs text-[var(--text-tertiary)] mb-2">Collateral</div>
                      <div className="flex flex-col gap-2">
                        {allCollaterals && allCollaterals.length > 0 ? (
                          allCollaterals.map((c) => (
                            <div key={c.symbol} className="flex items-center gap-2">
                              <div className="relative w-5 h-5 flex-shrink-0">
                                <TokenIcon symbol={c.symbol} size={20} />
                                <Image src="/chains/arbitrum-logo.png" alt="Arbitrum" width={10} height={10} className="absolute -bottom-0.5 -right-0.5 rounded-full ring-1 ring-[var(--bg-secondary)]" />
                              </div>
                              <span className="text-sm font-semibold text-[var(--text-primary)]">
                                {fmt(c.amount, c.decimals)} {c.symbol}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-[var(--text-tertiary)]">0.00</span>
                        )}
                      </div>
                    </div>

                    <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                      <div className="text-xs text-[var(--text-tertiary)] mb-2">Loan</div>
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={borrowSymbol} size={20} />
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {fmt(userBorrowAmount + crossChainLoanAmount, borrowDecimals)} {borrowSymbol}
                        </span>
                      </div>
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
              {(["collateral", "borrow", "repay"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setSidebarTab(tab); resetTx(); resetWcTx(); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    sidebarTab === tab
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {tab === "collateral" ? "Supply Collateral" : tab === "borrow" ? "Borrow" : "Repay"}
                </button>
              ))}
            </div>

            {sidebarTab === "collateral" ? (
              /* ── Supply Collateral tab ── */
              <div ref={collateralFormRef}>
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
                  onClick={() => {
                    if (!userAddress || !collateralTokenAddr || !collateralAmount) return;
                    const amount = parseUnits(collateralAmount, collateralDecimals);
                    if (amount <= 0n) return;
                    if (amount > walletCollateralBalance) {
                      setErrorMsg("Insufficient balance");
                      return;
                    }
                    setErrorMsg("");
                    setShowConfirmModal(true);
                  }}
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
                    : isLoading
                    ? "Loading..."
                    : !collateralAmount || Number(collateralAmount) <= 0
                    ? "Enter an amount"
                    : "Supply Collateral"}
                </button>
              </div>
            ) : sidebarTab === "borrow" ? (
              /* ── Borrow tab ── */
              <div ref={borrowFormRef}>
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

                {/* Cross-chain toggle */}
                <div className="mb-4 relative z-10">
                  <button
                    onClick={() => { setCrossChainEnabled(!crossChainEnabled); if (crossChainEnabled) { setDestChain(null); setChainDropdownOpen(false); } }}
                    disabled={txStep !== "idle"}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isCrossChain ? "rgba(59,130,246,0.08)" : "var(--bg-secondary)",
                      borderColor: isCrossChain ? "rgba(59,130,246,0.3)" : "var(--border)",
                    }}
                  >
                    <span className="text-xs font-medium text-[var(--text-primary)]">Borrow to Another Chain</span>
                    {/* Toggle switch */}
                    <div className={`relative w-9 h-5 rounded-full transition-colors ${isCrossChain ? "bg-blue-500" : "bg-[var(--bg-tertiary)]"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isCrossChain ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                  </button>

                  {/* Chain dropdown */}
                  {isCrossChain && (
                    <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div ref={chainDropdownRef} className="relative z-50">
                        {/* Custom dropdown trigger */}
                        <button
                          onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
                          disabled={txStep !== "idle"}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer hover:border-blue-500/40 focus:border-blue-500/50 outline-none"
                        >
                          {destChain ? (
                            <Image
                              src={destChain.logo}
                              alt={destChain.name}
                              width={20}
                              height={20}
                              className="rounded-full shrink-0"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-[var(--bg-tertiary)] shrink-0" />
                          )}
                          <span className={`flex-1 text-left ${!destChain ? "text-[var(--text-tertiary)]" : ""}`}>{destChain?.name ?? "Select chain"}</span>
                          <svg
                            width="12" height="12" viewBox="0 0 12 12" fill="none"
                            className={`text-[var(--text-tertiary)] transition-transform duration-200 ${chainDropdownOpen ? "rotate-180" : ""}`}
                          >
                            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {/* Dropdown options */}
                        {chainDropdownOpen && (
                          <div
                            className="absolute z-50 top-[calc(100%+4px)] left-0 w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden origin-top"
                          >
                            {DEST_CHAINS.map((chain) => (
                              <button
                                key={chain.eid}
                                onClick={() => {
                                  setDestChain(chain);
                                  setChainDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
                                  destChain?.eid === chain.eid
                                    ? "bg-blue-500/10 text-blue-400"
                                    : "text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                                }`}
                              >
                                <Image
                                  src={chain.logo}
                                  alt={chain.name}
                                  width={20}
                                  height={20}
                                  className="rounded-full shrink-0"
                                />
                                <span className="flex-1 text-left">{chain.name}</span>
                                {destChain?.eid === chain.eid && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M3.5 7l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {!oftConfigured && factoryAddr && (
                        <p className="text-[10px] text-red-400 px-1">
                          OFT adapter not configured for {borrowSymbol}
                        </p>
                      )}
                    </div>
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

                {/* Action button — opens review modal */}
                <button
                  onClick={() => {
                    if (!userAddress || !borrowAmount) return;
                    const amount = parseUnits(borrowAmount, borrowDecimals);
                    if (amount <= 0n) return;
                    if (liquidity !== undefined && amount > liquidity) {
                      setErrorMsg("Exceeds available liquidity");
                      return;
                    }
                    if (amount > maxBorrowable + userBorrowAmount) {
                      setErrorMsg("Exceeds maximum borrowable amount based on your collateral and LTV");
                      return;
                    }
                    if (!hasPosition || !positionCollateralBalance || positionCollateralBalance === 0n) {
                      setErrorMsg("Supply collateral first before borrowing");
                      return;
                    }
                    if (isCrossChain && (!destChain || !oftConfigured)) return;
                    setErrorMsg("");
                    setShowBorrowModal(true);
                  }}
                  disabled={
                    txStep !== "idle" ||
                    !isConnected ||
                    isLoading ||
                    !borrowAmount ||
                    Number(borrowAmount) <= 0 ||
                    (isCrossChain && (!destChain || !oftConfigured || lzNativeFee === 0n))
                  }
                  className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!isConnected
                    ? "Connect Wallet"
                    : isLoading
                    ? "Loading..."
                    : isCrossChain && !destChain
                    ? "Select a destination chain"
                    : isCrossChain && !oftConfigured
                    ? "OFT Not Configured"
                    : !borrowAmount || Number(borrowAmount) <= 0
                    ? "Enter an amount"
                    : isCrossChain && lzNativeFee === 0n && crossChainParsedAmount > 0n
                    ? "Estimating Fee..."
                    : isCrossChain && destChain
                    ? `Borrow to ${destChain.name}`
                    : "Borrow"}
                </button>
              </div>
            ) : (
              /* ── Repay tab ── */
              <div ref={repayFormRef}>
                {/* Success state */}
                {(rlTxStep === "success" || wcTxStep === "success") ? (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <p className="text-[var(--text-primary)] font-medium mb-1">
                      {rlTxStep === "success" ? "Repay Successful!" : "Withdraw Successful!"}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mb-4">
                      {rlTxStep === "success" ? "Your loan has been repaid." : "Collateral has been returned to your wallet."}
                    </p>
                    <button
                      onClick={() => { resetRlTx(); resetWcTx(); }}
                      className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ── Repay Loan input card ── */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          Repay Loan {borrowSymbol}
                        </span>
                        {borrowSymbol ? (
                          <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                        )}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={repayLoanAmount}
                        onChange={(e) => {
                          if (/^\d*\.?\d*$/.test(e.target.value)) setRepayLoanAmount(e.target.value);
                        }}
                        disabled={rlTxStep !== "idle"}
                        className="w-full bg-transparent outline-none text-3xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-2"
                      />
                      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                        <span>
                          {repayLoanAmount && Number(repayLoanAmount) > 0 && borrowPrice > 0n
                            ? `$${(Number(repayLoanAmount) * Number(formatUnits(borrowPrice, borrowPriceDec))).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : "$0"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            {isConnected && !isLoading
                              ? `${fmt(walletBorrowBalance, borrowDecimals)} ${borrowSymbol}`
                              : "—"}
                          </span>
                          {isConnected && !isLoading && userBorrowAmount > 0n && (
                            <button
                              onClick={() => {
                                const max = walletBorrowBalance < userBorrowAmount ? walletBorrowBalance : userBorrowAmount;
                                setRepayLoanAmount(formatUnits(max, borrowDecimals));
                              }}
                              disabled={rlTxStep !== "idle"}
                              className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors cursor-pointer font-semibold"
                            >
                              MAX
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Withdraw Collateral input card ── */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          Withdraw Collateral {collateralSymbol}
                        </span>
                        {collateralSymbol ? (
                          <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={24} />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                        )}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={withdrawColAmount}
                        onChange={(e) => {
                          if (/^\d*\.?\d*$/.test(e.target.value)) setWithdrawColAmount(e.target.value);
                        }}
                        disabled={wcTxStep !== "idle"}
                        className="w-full bg-transparent outline-none text-3xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-2"
                      />
                      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                        <span>
                          {withdrawColAmount && Number(withdrawColAmount) > 0 && collateralPrice > 0n
                            ? `$${(Number(withdrawColAmount) * Number(formatUnits(collateralPrice, collateralPriceDec))).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : "$0"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            {isConnected && !isLoading && positionCollateralBalance !== undefined
                              ? `${fmt(positionCollateralBalance as bigint, collateralDecimals)} ${collateralSymbol}`
                              : "—"}
                          </span>
                          {isConnected && !isLoading && positionCollateralBalance && positionCollateralBalance > 0n && (
                            <button
                              onClick={() => setWithdrawColAmount(formatUnits(positionCollateralBalance, collateralDecimals))}
                              disabled={wcTxStep !== "idle"}
                              className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors cursor-pointer font-semibold"
                            >
                              MAX
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Combined info card ── */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 mb-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={20} />
                          <span className="text-[var(--text-secondary)]">Collateral ({collateralSymbol || "..."})</span>
                        </div>
                        <span className="text-[var(--text-primary)] font-medium">
                          {positionCollateralBalance ? fmt(positionCollateralBalance, collateralDecimals) : "0.00"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={20} />
                          <span className="text-[var(--text-secondary)]">Loan ({borrowSymbol || "..."})</span>
                        </div>
                        <span className="text-[var(--text-primary)] font-medium">
                          {fmt(userBorrowAmount, borrowDecimals)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">LTV</span>
                        <span className="text-[var(--text-primary)]">
                          {collateralValueUsd > 0 ? ((borrowValueUsd / collateralValueUsd) * 100).toFixed(2) : "0.00"}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Rate</span>
                        <span className="text-[var(--text-primary)]">{borrowApy.toFixed(2)}%</span>
                      </div>
                    </div>

                    {/* Errors */}
                    {rlErrorMsg && (
                      <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {rlErrorMsg}
                      </div>
                    )}
                    {wcErrorMsg && (
                      <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {wcErrorMsg}
                      </div>
                    )}

                    {/* Action button */}
                    <button
                      onClick={() => {
                        const hasRepay = repayLoanAmount && Number(repayLoanAmount) > 0;
                        const hasWithdraw = withdrawColAmount && Number(withdrawColAmount) > 0;
                        if (hasRepay) handleRepayLoan();
                        else if (hasWithdraw) handleWithdrawCollateral();
                      }}
                      disabled={
                        (rlTxStep !== "idle" && wcTxStep !== "idle") ||
                        !isConnected ||
                        isLoading ||
                        ((!repayLoanAmount || Number(repayLoanAmount) <= 0) && (!withdrawColAmount || Number(withdrawColAmount) <= 0))
                      }
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {!isConnected
                        ? "Connect Wallet"
                        : rlTxStep === "approving"
                        ? "Approving..."
                        : rlTxStep === "repaying"
                        ? "Repaying..."
                        : wcTxStep === "withdrawing"
                        ? "Withdrawing..."
                        : isLoading
                        ? "Loading..."
                        : repayLoanAmount && Number(repayLoanAmount) > 0
                        ? "Repay Loan"
                        : withdrawColAmount && Number(withdrawColAmount) > 0
                        ? "Withdraw Collateral"
                        : "Enter an amount"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm Supply Collateral Modal ── */}
      {showConfirmModal && (() => {
        const isReview = txStep === "idle" || txStep === "error";
        const isConfirming = txStep === "approving" || txStep === "supplying-collateral";
        const isDone = txStep === "success";
        const currentCollateral = positionCollateralBalance ?? 0n;
        const inputParsed = (() => { try { return parseUnits(collateralAmount || "0", collateralDecimals); } catch { return 0n; } })();
        const newCollateral = currentCollateral + inputParsed;
        const collateralUsd = collateralPrice > 0n
          ? (Number(collateralAmount || 0) * Number(formatUnits(collateralPrice, collateralPriceDec))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "0.00";

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
              ref={colModalBackdropRef}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { if (isReview || isDone) { resetTx(); setShowConfirmModal(false); if (isDone) setCollateralAmount(""); } }}
            />
            {/* Card */}
            <div ref={colModalCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {isDone ? "Transaction Successful" : isConfirming ? "Confirm" : "Review"}
                </h3>
                {(isReview || isDone) && (
                  <button
                    onClick={() => { resetTx(); setShowConfirmModal(false); if (isDone) setCollateralAmount(""); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div ref={colModalContentRef} className="px-6 pb-6 space-y-4">
                {/* Pool info card — shown on Review & Confirm */}
                {!isDone && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
                    {/* Token pair + LTV badge + link */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="relative w-10 h-6">
                          <div className="absolute left-0 z-10">
                            <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={24} />
                          </div>
                          <div className="absolute left-4">
                            <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[var(--text-primary)] ml-2">
                          {collateralSymbol} / {borrowSymbol}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                          {ltv.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Supply Collateral amount */}
                    <div className="text-xs text-[var(--text-tertiary)] mb-1.5">Supply Collateral</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-[var(--text-primary)]">
                          {collateralAmount}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                          ${collateralUsd}
                        </span>
                      </div>
                      <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={28} />
                    </div>
                  </div>
                )}

                {/* ── Review phase: Info rows + Confirm button ── */}
                {isReview && (
                  <>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                      {/* Collateral change */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Collateral ({collateralSymbol})</span>
                        <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
                          <span>{fmt(currentCollateral, collateralDecimals)}</span>
                          <span className="text-[var(--text-tertiary)]">→</span>
                          <span className="text-[var(--accent)] font-medium">{fmt(newCollateral, collateralDecimals)}</span>
                        </div>
                      </div>
                      {/* Rate */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Rate</span>
                        <span className="text-[var(--text-primary)]">{borrowApy.toFixed(2)}%</span>
                      </div>
                      {/* LTV */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">LTV</span>
                        <span className="text-[var(--text-primary)]">{ltv.toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Error */}
                    {errorMsg && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {errorMsg}
                      </div>
                    )}

                    {/* Confirm button */}
                    <button
                      onClick={() => {
                        if (txStep === "error") {
                          setTxStep("idle");
                          setErrorMsg("");
                          resetApprove();
                          resetCollateral();
                        }
                        handleSupplyCollateral();
                      }}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {txStep === "error" ? "Retry" : "Confirm"}
                    </button>
                  </>
                )}

                {/* ── Confirm phase: Loading animation ── */}
                {isConfirming && (
                  <div className="space-y-4">
                    {/* Tx hash if available */}
                    {(approveTxHash || collateralTxHash) && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {txStep === "approving" ? "Approve" : "Supply Collateral"}
                        </span>
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${collateralTxHash ?? approveTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          {((collateralTxHash ?? approveTxHash) as string).slice(0, 6)}...{((collateralTxHash ?? approveTxHash) as string).slice(-4)}
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    )}

                    {/* Animated progress bar */}
                    <div className="w-full h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full animate-pulse"
                        style={{
                          width: txStep === "supplying-collateral" ? "70%" : "35%",
                          transition: "width 1.5s ease-in-out",
                        }}
                      />
                    </div>

                    {/* Proceed in wallet message */}
                    <div className="flex items-center justify-center gap-2 py-2">
                      {/* Spinner */}
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

                {/* ── Done phase ── */}
                {isDone && (
                  <div className="space-y-4">
                    {/* Success icon */}
                    <div className="flex flex-col items-center py-4">
                      <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                          <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Collateral supplied successfully
                      </p>
                    </div>

                    {/* Explorer link */}
                    {collateralTxHash && (
                      <div className="flex items-center justify-center">
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${collateralTxHash}`}
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

                    {/* Done button */}
                    <button
                      onClick={() => { resetTx(); setShowConfirmModal(false); setCollateralAmount(""); }}
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

      {/* ── Confirm Borrow Modal ── */}
      {showBorrowModal && (() => {
        const isReview = txStep === "idle" || txStep === "error";
        const isConfirming = txStep === "borrowing" || txStep === "borrowing-crosschain";
        const isDone = txStep === "success";
        const borrowUsd = borrowPrice > 0n
          ? (Number(borrowAmount || 0) * Number(formatUnits(borrowPrice, borrowPriceDec))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "0.00";
        const newBorrowTotal = userBorrowAmount + ((() => { try { return parseUnits(borrowAmount || "0", borrowDecimals); } catch { return 0n; } })());
        const newBorrowValueUsd = borrowValueUsd + Number(borrowAmount || 0) * Number(formatUnits(borrowPrice, borrowPriceDec));
        const newHf = newBorrowValueUsd > 0 ? collateralValueUsd / newBorrowValueUsd : Infinity;
        const activeTxHash = isCrossChain ? crossChainTxHash : borrowTxHash;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              ref={borModalBackdropRef}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { if (isReview || isDone) { resetTx(); setShowBorrowModal(false); if (isDone) setBorrowAmount(""); } }}
            />
            <div ref={borModalCardRef} className="relative z-10 w-full max-w-[420px] mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {isDone ? "Transaction Successful" : isConfirming ? "Confirm" : "Review"}
                </h3>
                {(isReview || isDone) && (
                  <button
                    onClick={() => { resetTx(); setShowBorrowModal(false); if (isDone) setBorrowAmount(""); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div ref={borModalContentRef} className="px-6 pb-6 space-y-4">
                {/* Pool info card — Review & Confirm */}
                {!isDone && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="relative w-10 h-6">
                          <div className="absolute left-0 z-10">
                            <TokenIcon symbol={collateralSymbol} color={getTokenColor(collateralSymbol)} size={24} />
                          </div>
                          <div className="absolute left-4">
                            <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={24} />
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[var(--text-primary)] ml-2">
                          {collateralSymbol} / {borrowSymbol}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                          {ltv.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-[var(--text-tertiary)] mb-1.5">
                      {isCrossChain && destChain ? `Borrow to ${destChain.name}` : "Borrow"}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-[var(--text-primary)]">
                          {borrowAmount}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                          ${borrowUsd}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isCrossChain && destChain && (
                          <Image src={destChain.logo} alt={destChain.name} width={16} height={16} className="rounded-full" />
                        )}
                        <TokenIcon symbol={borrowSymbol} color={getTokenColor(borrowSymbol)} size={28} />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Review phase ── */}
                {isReview && (
                  <>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                      {/* Loan change */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Loan ({borrowSymbol})</span>
                        <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
                          <span>{fmt(userBorrowAmount, borrowDecimals)}</span>
                          <span className="text-[var(--text-tertiary)]">→</span>
                          <span className="text-[var(--accent)] font-medium">{fmt(newBorrowTotal, borrowDecimals)}</span>
                        </div>
                      </div>
                      {/* Rate */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Rate</span>
                        <span className="text-[var(--text-primary)]">{borrowApy.toFixed(2)}%</span>
                      </div>
                      {/* Health Factor */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">Health Factor</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--text-primary)]">
                            {healthFactor === Infinity ? "∞" : healthFactor.toFixed(2)}
                          </span>
                          <span className="text-[var(--text-tertiary)]">→</span>
                          <span className={
                            newHf >= 1.5 ? "text-green-400 font-medium"
                              : newHf >= 1.1 ? "text-yellow-400 font-medium"
                              : "text-red-400 font-medium"
                          }>
                            {newHf === Infinity ? "∞" : newHf.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {/* LTV */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-tertiary)]">LTV</span>
                        <span className="text-[var(--text-primary)]">{ltv.toFixed(0)}%</span>
                      </div>
                      {/* Destination chain for cross-chain */}
                      {isCrossChain && destChain && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--text-tertiary)]">Destination</span>
                          <div className="flex items-center gap-1.5">
                            <Image src={destChain.logo} alt={destChain.name} width={14} height={14} className="rounded-full" />
                            <span className="text-[var(--text-primary)]">{destChain.name}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {errorMsg && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (txStep === "error") {
                          setTxStep("idle");
                          setErrorMsg("");
                          resetBorrow();
                          resetCrossChain();
                        }
                        if (isCrossChain && destChain) {
                          handleCrossChainBorrow();
                        } else {
                          handleBorrow();
                        }
                      }}
                      className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-[var(--bg-primary)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {txStep === "error" ? "Retry" : "Confirm"}
                    </button>
                  </>
                )}

                {/* ── Confirm phase: Loading ── */}
                {isConfirming && (
                  <div className="space-y-4">
                    {activeTxHash && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {isCrossChain ? "Cross-Chain Borrow" : "Borrow"}
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
                        style={{ width: "50%", transition: "width 1.5s ease-in-out" }}
                      />
                    </div>

                    <div className="flex items-center justify-center gap-2 py-2">
                      <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm text-[var(--text-secondary)]">
                        Signature 1/1 — Proceed in your wallet
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Done phase ── */}
                {isDone && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center py-4">
                      <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                          <path d="M7 14l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {isCrossChain
                          ? `Tokens will arrive on ${destChain?.name ?? "destination"} via LayerZero`
                          : "Borrow successful"}
                      </p>
                    </div>

                    {activeTxHash && (
                      <div className="flex items-center justify-center">
                        <a
                          href={`${CHAIN.blockExplorers?.default.url}/tx/${activeTxHash}`}
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
                      onClick={() => { resetTx(); setShowBorrowModal(false); setBorrowAmount(""); }}
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
