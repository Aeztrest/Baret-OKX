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

// uint256 max — the de-facto "unlimited" sentinel used by wallets/dApps for
// infinite approvals.
export const UINT256_MAX = (1n << 256n) - 1n;

// Anything above this threshold is treated as "practically unlimited" even
// if it isn't the literal max (some dApps use e.g. 2^128 as their "infinite").
export const UNLIMITED_THRESHOLD = 1n << 128n;
