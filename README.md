# StyLend Finance — Frontend

A full-featured DeFi lending & borrowing protocol frontend for [StyLend](https://github.com/StyLend), built with Next.js 16 and integrated with Arbitrum Stylus smart contracts. Features real-time pool data, cross-chain borrowing via LayerZero, interactive charts, and a WebGL-powered particle background.

![Arbitrum Sepolia](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-blue)
![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Pages & Functionality](#pages--functionality)
- [Architecture](#architecture)
- [Smart Contract Integration](#smart-contract-integration)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Supported Tokens](#supported-tokens)
- [Related Repositories](#related-repositories)

## Overview

StyLend Finance is a decentralized lending and borrowing protocol deployed on **Arbitrum Stylus**. This frontend application provides a complete interface for users to:

- Supply assets to earn yield
- Borrow against collateral with real-time health factor monitoring
- Bridge borrowed assets cross-chain via LayerZero
- Trade collateral between pools
- Claim testnet tokens via the faucet

The frontend consumes data from both on-chain smart contract reads (via **wagmi/viem**) and the [StyLend Indexer](https://github.com/StyLend/stylend-indexer) GraphQL API for historical events and snapshots.

## Features

- **Real-Time Pool Data** — Live utilization rates, APY, total supply/borrow, updated via polling
- **Cross-Chain Borrowing** — LayerZero OFT integration for borrowing to destination chains (e.g., Base Sepolia)
- **Interactive Charts** — Historical pool performance, interest rate model curves, and aggregated protocol metrics via Recharts
- **WebGL Background** — Animated Three.js particle system with Perlin noise shaders
- **Responsive Design** — Mobile-first layout with adaptive components, mobile-specific dropdowns, and tab navigation
- **GSAP Animations** — Smooth page transitions, staggered list entries, and modal animations
- **Wallet Integration** — RainbowKit-powered wallet connection with multi-wallet support
- **Health Factor Monitoring** — Visual health gauge for borrow positions with liquidation warnings
- **Multicall Batching** — Efficient contract reads via multicall to minimize RPC calls
- **Transaction History** — Paginated user activity feed with type filtering

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 16.1.6 (App Router) |
| **UI Library** | React 19 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **Web3** | wagmi 2.9 + viem 2.x |
| **Wallet** | RainbowKit 2.2.10 |
| **Data Fetching** | TanStack React Query 5 |
| **Charts** | Recharts 3.7 |
| **Animations** | GSAP 3.14 |
| **3D Graphics** | Three.js 0.183 + React Three Fiber 9 |
| **Package Manager** | Bun |

## Project Structure

```
stylend-fe/
├── app/                            # Next.js App Router pages
│   ├── layout.tsx                  # Root layout with providers & sidebar
│   ├── globals.css                 # Global styles, Tailwind theme, fonts
│   ├── page.tsx                    # Dashboard (home)
│   ├── borrow/
│   │   ├── page.tsx                # Borrow pools listing
│   │   └── [address]/page.tsx      # Borrow pool details & actions
│   ├── earn/
│   │   ├── page.tsx                # Earn pools listing
│   │   └── [address]/page.tsx      # Earn pool details & actions
│   ├── faucet/
│   │   └── page.tsx                # Testnet token faucet
│   └── trade-collateral/
│       └── page.tsx                # Collateral swap interface
│
├── components/
│   ├── Sidebar.tsx                 # Navigation sidebar with animated indicator
│   ├── Header.tsx                  # Page header & wallet button
│   ├── Providers.tsx               # Wagmi, React Query, RainbowKit providers
│   ├── ConnectWalletButton.tsx     # Wallet connection component
│   ├── TokenIcon.tsx               # Token logo with initial fallback
│   ├── PageTransition.tsx          # Route change animations
│   ├── AnimatedCheckmark.tsx       # Success state SVG animation
│   ├── charts/
│   │   ├── PoolAreaChart.tsx       # Time-series area chart
│   │   ├── InterestRateModelChart.tsx # IRM curve visualization
│   │   └── TimePeriodSelect.tsx    # Time range selector (1D–1Y)
│   └── webgl/
│       ├── WebGLBackground.tsx     # Three.js particle background
│       ├── WebGLWrapper.tsx        # R3F Canvas wrapper
│       └── particles/             # Particle system with noise shaders
│
├── hooks/
│   ├── usePoolData.ts              # Single/all pool contract reads
│   ├── useLendingPools.ts          # Pool addresses from indexer GraphQL
│   ├── usePoolSnapshots.ts         # Historical pool snapshots
│   ├── useAggregatedSnapshots.ts   # Multi-pool chart aggregation
│   ├── useUserActivity.ts          # User transaction history
│   ├── usePoolTransactions.ts      # Pool-specific events
│   ├── useBorrowTransactions.ts    # Borrow activity feed
│   └── useGsap.ts                  # GSAP animation utilities
│
├── lib/
│   ├── contracts.ts                # Contract addresses, token config, chain setup
│   ├── wagmi.ts                    # Wagmi + RainbowKit configuration
│   └── abis/                       # Smart contract ABIs
│       ├── lending-pool-abi.ts
│       ├── lending-pool-router-abi.ts
│       ├── lending-pool-factory-abi.ts
│       ├── interest-rate-model-abi.ts
│       ├── mock-erc20-abi.ts
│       ├── token-data-stream-abi.ts
│       ├── multicall-abi.ts
│       ├── oft-adapter-abi.ts      # LayerZero OFT bridge
│       └── is-healthy-abi.ts
│
├── types/
│   └── glsl.d.ts                   # GLSL shader type declarations
│
├── icons/                          # SVG icon assets
└── public/
    ├── chains/                     # Blockchain logo assets
    └── models/                     # 3D models for WebGL
```

## Pages & Functionality

### Dashboard (`/`)

The main overview page showing a user's entire protocol position:

- **Total Deposits** — Aggregated supply across all pools with USD valuation
- **Total Borrows** — Outstanding loans with interest tracking
- **Collateral Breakdown** — Per-pool collateral positions
- **Performance Charts** — Historical TVL and APY trends with time period selection
- **Activity Feed** — Paginated transaction history with type filtering (supply, borrow, repay, withdraw, collateral)

### Earn (`/earn` & `/earn/[address]`)

Lending interface for depositing assets to earn yield:

- **Pool Listing** — All available supply pools with APY, total supply, and utilization
- **Pool Details** — Deposit/withdraw forms, historical supply APY chart, pool metrics
- **Manage Tab** — View and manage existing deposit positions with share token details

### Borrow (`/borrow` & `/borrow/[address]`)

Borrowing interface with collateral management:

- **Pool Listing** — Available borrow pools with rates, available liquidity, and LTV
- **Pool Details** — Borrow/repay forms, collateral supply/withdraw
- **Health Factor** — Visual gauge showing position health with liquidation threshold
- **Interest Rate Model** — Interactive chart of the two-slope IRM curve
- **Cross-Chain Borrowing** — Borrow assets to destination chains via LayerZero OFT bridges with configurable gas options
- **Utilization Metrics** — Circle progress indicator for pool utilization

### Trade Collateral (`/trade-collateral`)

Swap collateral tokens between pools:

- **Token Selection** — Choose source and destination tokens
- **Fee Tier Selection** — Choose between 0.05%, 0.10%, and 0.30% fee tiers
- **Slippage Settings** — Configurable slippage tolerance
- **Live Quotes** — Real-time swap rate fetching

### Faucet (`/faucet`)

Testnet token minting page:

- **Token Grid** — USDC, USDT, WETH, WBTC with current balances
- **One-Click Mint** — Mint testnet tokens directly from the UI
- **Network Detection** — Automatic prompt to switch to Arbitrum Sepolia
- **Connect Wallet Overlay** — Centered overlay for wallet connection on mobile

## Architecture

### Data Flow

```
┌──────────────┐     GraphQL      ┌───────────────────┐
│   StyLend    │ ◄──────────────► │  StyLend Indexer   │
│   Frontend   │                  │  (api.stylend.xyz) │
│              │     RPC/viem     ├───────────────────┘
│  (Next.js)   │ ◄──────────────► │  Arbitrum Sepolia  │
│              │                  │  Smart Contracts   │
└──────────────┘                  └───────────────────┘
```

- **On-chain reads** (via wagmi/viem): Real-time pool state, user positions, token balances, health factors
- **GraphQL API** (via indexer): Historical snapshots, transaction events, pool discovery, user activity

### State Management

- **TanStack React Query** — Primary data layer with configurable polling intervals:
  - Pool data: 5-second refetch intervals
  - Historical snapshots: 60-second intervals
  - Automatic refetch on window focus
- **Component State** — Local React state for UI concerns (modals, forms, tabs, dropdowns)
- **GSAP Refs** — Timeline references for coordinated animations

### Styling & Design

- **Dark Theme** — Glassmorphism aesthetic with backdrop blur effects
- **Fonts** — Panchang (headings) + Inter (body)
- **Colors** — Black primary, blue accent (`#016be5`), light/medium gray text
- **Responsive** — Mobile-first with `md:` (768px) and `lg:` (1024px) breakpoints

## Smart Contract Integration

The frontend interacts with the following on-chain contracts through ABIs defined in `lib/abis/`:

| Contract | Purpose |
|---|---|
| **LendingPool** | User-facing entry point for supply/borrow operations |
| **LendingPoolRouter** | Core accounting, share mechanics, LTV management |
| **LendingPoolFactory** | Pool creation, IRM & oracle address lookup |
| **InterestRateModel** | Borrow rate calculation, reserve factor configuration |
| **TokenDataStream** | Chainlink-compatible price oracle feeds |
| **MockERC20** | Standard ERC20 + `mint()` for testnet faucet |
| **OFT Adapter** | LayerZero cross-chain token bridging |
| **Multicall** | Batch contract reads in a single RPC call |
| **IsHealthy** | Health factor calculation & liquidation eligibility |

### Key Contract Addresses (Arbitrum Sepolia)

| Contract | Address |
|---|---|
| Multicall | `0xe9a1adc452cd26cae2062d997a97a3800eaaeaa3` |

> Full contract deployment addresses are available in the [Smart Contract repository](https://github.com/StyLend/stylend-sc).

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- A Web3 wallet (MetaMask, Rabby, etc.)

### Install Dependencies

```bash
bun install
```

### Run Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
bun run build
```

### Start Production Server

```bash
bun run start
```

### Lint

```bash
bun run lint
```

## Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_WC_PROJECT_ID=your_walletconnect_project_id
```

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_WC_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com/) project ID | Optional (has fallback) |

## Supported Tokens

Testnet tokens deployed on **Arbitrum Sepolia**:

| Token | Address | Decimals |
|---|---|---|
| USDC | `0x5602a3f9b8a935df32871bb1c6289f24620233f7` | 6 |
| USDT | `0x21483bcde6e19fdb5acc1375c443ebb17147a69a` | 6 |
| WETH | `0x48b3f901d040796f9cda37469fc5436fca711366` | 18 |
| WBTC | `0xacbc1ce1908b9434222e60d6cfed9e011a386220` | 8 |

## Related Repositories

| Repository | Description |
|---|---|
| [**stylend-sc**](https://github.com/StyLend/stylend-sc) | Smart contracts — 23 Rust/Stylus contracts for the lending protocol (LendingPool, Router, Factory, IRM, Positions, LayerZero OFT bridges) |
| [**stylend-indexer**](https://github.com/StyLend/stylend-indexer) | Blockchain indexer — Real-time event indexing with Ponder, historical snapshots, APY calculations, and GraphQL API at `api.stylend.xyz` |

## License

MIT
