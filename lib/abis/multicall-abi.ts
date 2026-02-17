export const multicallAbi = [
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "factory",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "factory",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "new_owner",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      {
        name: "_new_implementation",
        type: "address",
      },
      {
        name: "_data",
        type: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setFactory",
    inputs: [
      {
        name: "factory",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rescueTokens",
    inputs: [
      {
        name: "token",
        type: "address",
      },
      {
        name: "to",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rescueETH",
    inputs: [
      {
        name: "to",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "borrowDebtCrossChain",
    inputs: [
      {
        name: "lending_pool",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
      {
        name: "send_param",
        type: "tuple",
        components: [
          {
            name: "dstEid",
            type: "uint32",
          },
          {
            name: "to",
            type: "bytes32",
          },
          {
            name: "amountLD",
            type: "uint256",
          },
          {
            name: "minAmountLD",
            type: "uint256",
          },
          {
            name: "extraOptions",
            type: "bytes",
          },
          {
            name: "composeMsg",
            type: "bytes",
          },
          {
            name: "oftCmd",
            type: "bytes",
          },
        ],
      },
      {
        name: "messaging_fee",
        type: "tuple",
        components: [
          {
            name: "nativeFee",
            type: "uint256",
          },
          {
            name: "lzTokenFee",
            type: "uint256",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
      },
    ],
  },
  {
    type: "event",
    name: "BorrowDebtCrossChain",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
      },
      {
        name: "lendingPool",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "userAmount",
        type: "uint256",
        indexed: false,
      },
      {
        name: "dstEid",
        type: "uint32",
        indexed: false,
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ZeroAmount",
    inputs: [],
  },
  {
    type: "error",
    name: "NotAuthorized",
    inputs: [
      {
        name: "executor",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "Reentrancy",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "OftNotConfigured",
    inputs: [
      {
        name: "token",
        type: "address",
      },
    ],
  },
] as const;
