export interface Asset {
  symbol: string;
  name: string;
  icon: string; // color for placeholder
  price: number;
}

export interface UserPosition {
  asset: Asset;
  balance: number;
  balanceUsd: number;
  apy: number;
  isCollateral?: boolean;
}

export interface MarketAsset {
  asset: Asset;
  totalSupplied: number;
  totalSuppliedUsd: number;
  totalBorrowed: number;
  totalBorrowedUsd: number;
  supplyApy: number;
  borrowApy: number;
  availableLiquidity: number;
  availableLiquidityUsd: number;
  ltv: number;
  walletBalance: number;
  utilization: number; // percentage 0-100
}

export interface IsolatedMarket {
  collateral: Asset;
  borrowAsset: Asset;
  supplyApy: number;
  borrowApy: number;
  totalAssets: number;
  totalAssetsUsd: number;
  totalBorrowed: number;
  totalBorrowedUsd: number;
  totalCollateral: number;
  totalCollateralUsd: number;
  availableLiquidity: number;
  availableLiquidityUsd: number;
  ltv: number;
}

export const assets: Record<string, Asset> = {
  ETH: { symbol: "ETH", name: "Ethereum", icon: "#627eea", price: 3245.5 },
  WBTC: { symbol: "WBTC", name: "Wrapped Bitcoin", icon: "#f7931a", price: 97520.0 },
  USDC: { symbol: "USDC", name: "USD Coin", icon: "#2775ca", price: 1.0 },
  USDT: { symbol: "USDT", name: "Tether", icon: "#26a17b", price: 1.0 },
  DAI: { symbol: "DAI", name: "Dai", icon: "#f5ac37", price: 1.0 },
  ARB: { symbol: "ARB", name: "Arbitrum", icon: "#28a0f0", price: 1.12 },
  LINK: { symbol: "LINK", name: "Chainlink", icon: "#2a5ada", price: 18.45 },
  UNI: { symbol: "UNI", name: "Uniswap", icon: "#ff007a", price: 9.87 },
  SOL: { symbol: "SOL", name: "Solana", icon: "#9945ff", price: 178.5 },
  AAVE: { symbol: "AAVE", name: "Aave", icon: "#b6509e", price: 285.3 },
};

export const userSupplied: UserPosition[] = [];

export const userBorrowed: UserPosition[] = [];

export const marketAssets: MarketAsset[] = [
  {
    asset: assets.ETH,
    totalSupplied: 15420,
    totalSuppliedUsd: 50_050_910,
    totalBorrowed: 8230,
    totalBorrowedUsd: 26_710_315,
    supplyApy: 2.14,
    borrowApy: 3.82,
    availableLiquidity: 7190,
    availableLiquidityUsd: 23_340_595,
    ltv: 82.5,
    walletBalance: 0.85,
    utilization: 53.4,
  },
  {
    asset: assets.WBTC,
    totalSupplied: 245,
    totalSuppliedUsd: 23_892_400,
    totalBorrowed: 89,
    totalBorrowedUsd: 8_679_280,
    supplyApy: 0.35,
    borrowApy: 1.6,
    availableLiquidity: 156,
    availableLiquidityUsd: 15_213_120,
    ltv: 73.0,
    walletBalance: 0.005,
    utilization: 36.3,
  },
  {
    asset: assets.USDC,
    totalSupplied: 49_690_000,
    totalSuppliedUsd: 49_690_000,
    totalBorrowed: 35_540_000,
    totalBorrowedUsd: 35_540_000,
    supplyApy: 5.47,
    borrowApy: 8.62,
    availableLiquidity: 14_150_000,
    availableLiquidityUsd: 14_150_000,
    ltv: 87.0,
    walletBalance: 1200,
    utilization: 71.5,
  },
  {
    asset: assets.USDT,
    totalSupplied: 13_300_000,
    totalSuppliedUsd: 13_300_000,
    totalBorrowed: 7_780_000,
    totalBorrowedUsd: 7_780_000,
    supplyApy: 3.62,
    borrowApy: 7.9,
    availableLiquidity: 5_520_000,
    availableLiquidityUsd: 5_520_000,
    ltv: 85.0,
    walletBalance: 500,
    utilization: 58.5,
  },
  {
    asset: assets.DAI,
    totalSupplied: 12_000_000,
    totalSuppliedUsd: 12_000_000,
    totalBorrowed: 8_400_000,
    totalBorrowedUsd: 8_400_000,
    supplyApy: 3.95,
    borrowApy: 4.89,
    availableLiquidity: 3_600_000,
    availableLiquidityUsd: 3_600_000,
    ltv: 80.0,
    walletBalance: 0,
    utilization: 70.0,
  },
  {
    asset: assets.ARB,
    totalSupplied: 8_500_000,
    totalSuppliedUsd: 9_520_000,
    totalBorrowed: 2_100_000,
    totalBorrowedUsd: 2_352_000,
    supplyApy: 1.87,
    borrowApy: 4.25,
    availableLiquidity: 6_400_000,
    availableLiquidityUsd: 7_168_000,
    ltv: 68.0,
    walletBalance: 250,
    utilization: 24.7,
  },
  {
    asset: assets.LINK,
    totalSupplied: 1_200_000,
    totalSuppliedUsd: 22_140_000,
    totalBorrowed: 450_000,
    totalBorrowedUsd: 8_302_500,
    supplyApy: 2.15,
    borrowApy: 3.71,
    availableLiquidity: 750_000,
    availableLiquidityUsd: 13_837_500,
    ltv: 72.0,
    walletBalance: 15,
    utilization: 37.5,
  },
  {
    asset: assets.SOL,
    totalSupplied: 24_880,
    totalSuppliedUsd: 4_441_080,
    totalBorrowed: 20_370,
    totalBorrowedUsd: 3_636_045,
    supplyApy: 25.09,
    borrowApy: 40.75,
    availableLiquidity: 4_510,
    availableLiquidityUsd: 805_035,
    ltv: 75.0,
    walletBalance: 2.5,
    utilization: 81.9,
  },
];

export const isolatedMarkets: IsolatedMarket[] = [
  {
    collateral: assets.ETH,
    borrowAsset: assets.USDT,
    supplyApy: 9.1,
    borrowApy: 13.85,
    totalAssets: 254_950,
    totalAssetsUsd: 254_810,
    totalBorrowed: 209_360,
    totalBorrowedUsd: 209_250,
    totalCollateral: 440_360,
    totalCollateralUsd: 504_400,
    availableLiquidity: 45_590,
    availableLiquidityUsd: 45_570,
    ltv: 83,
  },
  {
    collateral: assets.ARB,
    borrowAsset: assets.USDC,
    supplyApy: 0.96,
    borrowApy: 1.79,
    totalAssets: 24_610,
    totalAssetsUsd: 24_610,
    totalBorrowed: 16_440,
    totalBorrowedUsd: 16_440,
    totalCollateral: 37_140,
    totalCollateralUsd: 37_670,
    availableLiquidity: 8_170,
    availableLiquidityUsd: 8_170,
    ltv: 75,
  },
  {
    collateral: assets.WBTC,
    borrowAsset: assets.DAI,
    supplyApy: 13.16,
    borrowApy: 19.64,
    totalAssets: 2_520,
    totalAssetsUsd: 75_760,
    totalBorrowed: 2_110,
    totalBorrowedUsd: 63_450,
    totalCollateral: 8_110,
    totalCollateralUsd: 246_640,
    availableLiquidity: 409.66,
    availableLiquidityUsd: 12_320,
    ltv: 80,
  },
];

// Dashboard summary stats
export const dashboardStats = {
  currentBalance: 0,
  totalApy: 0,
  apyChange: 0,
  borrowLimit: 0,
  borrowLimitUsed: 0,
  healthFactor: 10,
  totalDeposited: 0,
  depositedPerDay: 0,
  totalBorrowed: 0,
  borrowedPerDay: 0,
};
