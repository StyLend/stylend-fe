export const tokenDataStreamAbi = [
  {
    type: "function",
    name: "tokenPriceFeed",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setTokenPriceFeed",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_priceFeed", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestRoundData",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "price", type: "uint256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
] as const;
