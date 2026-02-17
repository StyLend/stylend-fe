export const interestRateModelAbi = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [{ name: "new_owner", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "version",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "factory",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setFactory",
    inputs: [{ name: "new_factory", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "scaledPercentage",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lendingPoolBaseRate",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lendingPoolRateAtOptimal",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lendingPoolOptimalUtilization",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lendingPoolMaxUtilization",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokenReserveFactor",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lendingPoolMaxRate",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calculateBorrowRate",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "total_supply", type: "uint256" },
      { name: "total_borrow", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "calculateInterest",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "elapsed_time", type: "uint256" },
      { name: "total_supply", type: "uint256" },
      { name: "total_borrow", type: "uint256" },
    ],
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLendingPoolBaseRate",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "rate", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLendingPoolRateAtOptimal",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "rate", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLendingPoolOptimalUtilization",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "utilization", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLendingPoolMaxUtilization",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "utilization", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setScaledPercentage",
    inputs: [{ name: "percentage", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setTokenReserveFactor",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "reserve_factor", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLendingPoolMaxRate",
    inputs: [
      { name: "lending_pool", type: "address" },
      { name: "max_rate", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [{ name: "account", type: "address" }],
  },
  {
    type: "error",
    name: "MaxUtilizationReached",
    inputs: [
      { name: "token", type: "address" },
      { name: "utilization", type: "uint256" },
      { name: "maxUtilization", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "LendingPoolBaseRateSet",
    inputs: [
      { name: "lendingPool", type: "address", indexed: true },
      { name: "rate", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LendingPoolOptimalUtilizationSet",
    inputs: [
      { name: "lendingPool", type: "address", indexed: true },
      { name: "utilization", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LendingPoolMaxUtilizationSet",
    inputs: [
      { name: "lendingPool", type: "address", indexed: true },
      { name: "utilization", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LendingPoolRateAtOptimalSet",
    inputs: [
      { name: "lendingPool", type: "address", indexed: true },
      { name: "rate", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ScaledPercentageSet",
    inputs: [
      { name: "percentage", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenReserveFactorSet",
    inputs: [
      { name: "lendingPool", type: "address", indexed: true },
      { name: "reserveFactor", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LendingPoolMaxRateSet",
    inputs: [
      { name: "lendingPool", type: "address", indexed: true },
      { name: "maxRate", type: "uint256", indexed: false },
    ],
  },
] as const;
