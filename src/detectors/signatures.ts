import { type Abi } from "viem";

// A small, focused catalogue of the function signatures that matter most for
// pre-signature wallet safety: approvals, permits, and privileged/ownership
// calls. Keyed by 4-byte selector so a single slice(data, 0, 10) look-up
// tells us which ABI fragment to decode with.
export const KNOWN_FUNCTIONS: Record<string, { name: string; abi: Abi; category: string }> = {
  "0x095ea7b3": {
    name: "approve",
    category: "erc20_approval",
    abi: [
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0x39509351": {
    name: "increaseAllowance",
    category: "erc20_approval",
    abi: [
      {
        type: "function",
        name: "increaseAllowance",
        inputs: [
          { name: "spender", type: "address" },
          { name: "addedValue", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0xa22cb465": {
    name: "setApprovalForAll",
    category: "nft_approval_for_all",
    abi: [
      {
        type: "function",
        name: "setApprovalForAll",
        inputs: [
          { name: "operator", type: "address" },
          { name: "approved", type: "bool" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0xd505accf": {
    name: "permit",
    category: "erc2612_permit",
    abi: [
      {
        type: "function",
        name: "permit",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0x23b872dd": {
    name: "transferFrom",
    category: "transfer",
    abi: [
      {
        type: "function",
        name: "transferFrom",
        inputs: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0xf2fde38b": {
    name: "transferOwnership",
    category: "privileged",
    abi: [
      {
        type: "function",
        name: "transferOwnership",
        inputs: [{ name: "newOwner", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0x3659cfe6": {
    name: "upgradeTo",
    category: "privileged",
    abi: [
      {
        type: "function",
        name: "upgradeTo",
        inputs: [{ name: "newImplementation", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
  },
  "0x4f1ef286": {
    name: "upgradeToAndCall",
    category: "privileged",
    abi: [
      {
        type: "function",
        name: "upgradeToAndCall",
        inputs: [
          { name: "newImplementation", type: "address" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
        stateMutability: "payable",
      },
    ],
  },
  "0x8f283970": {
    name: "changeAdmin",
    category: "privileged",
    abi: [
      {
        type: "function",
        name: "changeAdmin",
        inputs: [{ name: "newAdmin", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
  },
};

// Batching / meta-transaction wrappers. A malicious approve() or
// setApprovalForAll() rarely rides alone at the top level — it's usually one
// call inside a multicall or a Safe execTransaction. Each entry says how to
// pull the inner calldata(s) out of the decoded args so analyze.ts can decode
// and run the same detectors on what's actually being executed.
export const WRAPPER_FUNCTIONS: Record<
  string,
  { name: string; abi: Abi; extractInner: (args: readonly unknown[]) => `0x${string}`[] }
> = {
  // multicall(bytes[]) — OZ Multicall / Uniswap V2-style routers.
  "0xac9650d8": {
    name: "multicall",
    abi: [
      {
        type: "function",
        name: "multicall",
        inputs: [{ name: "data", type: "bytes[]" }],
        outputs: [{ type: "bytes[]" }],
        stateMutability: "payable",
      },
    ],
    extractInner: (args) => (args[0] as `0x${string}`[]) ?? [],
  },
  // multicall(uint256 deadline, bytes[]) — Uniswap V3 SwapRouter style.
  "0x5ae401dc": {
    name: "multicall",
    abi: [
      {
        type: "function",
        name: "multicall",
        inputs: [
          { name: "deadline", type: "uint256" },
          { name: "data", type: "bytes[]" },
        ],
        outputs: [{ type: "bytes[]" }],
        stateMutability: "payable",
      },
    ],
    extractInner: (args) => (args[1] as `0x${string}`[]) ?? [],
  },
  // Gnosis/Safe execTransaction(to, value, data, operation, ...) — the actual
  // call the Safe will make is buried in the 3rd argument.
  "0x6a761202": {
    name: "execTransaction",
    abi: [
      {
        type: "function",
        name: "execTransaction",
        inputs: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "operation", type: "uint8" },
          { name: "safeTxGas", type: "uint256" },
          { name: "baseGas", type: "uint256" },
          { name: "gasPrice", type: "uint256" },
          { name: "gasToken", type: "address" },
          { name: "refundReceiver", type: "address" },
          { name: "signatures", type: "bytes" },
        ],
        outputs: [{ type: "bool" }],
        stateMutability: "payable",
      },
    ],
    extractInner: (args) => {
      const data = args[2] as `0x${string}` | undefined;
      return data && data !== "0x" ? [data] : [];
    },
  },
};

// uint256 max — the de-facto "unlimited" sentinel used by wallets/dApps for
// infinite approvals.
export const UINT256_MAX = (1n << 256n) - 1n;

// Anything above this threshold is treated as "practically unlimited" even
// if it isn't the literal max (some dApps use e.g. 2^128 as their "infinite").
export const UNLIMITED_THRESHOLD = 1n << 128n;
