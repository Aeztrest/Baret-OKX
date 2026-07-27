import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeFunctionData, maxUint256 } from "viem";
import { analyzeTransaction, AnalyzeValidationError } from "./analyze.js";

const mockGetCode = vi.fn();
const mockGetBalance = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ getCode: mockGetCode, getBalance: mockGetBalance }),
  };
});

const TO = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const SPENDER = "0x1234567890123456789012345678901234567890";
const EOA = "0x000000000000000000000000000000000000dead";

const approveAbi = [
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
] as const;

const multicallAbi = [
  {
    type: "function",
    name: "multicall",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ type: "bytes[]" }],
    stateMutability: "payable",
  },
] as const;

const upgradeToAbi = [
  {
    type: "function",
    name: "upgradeTo",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

beforeEach(() => {
  mockGetCode.mockReset().mockResolvedValue("0x");
  mockGetBalance.mockReset().mockResolvedValue(0n);
});

describe("analyzeTransaction", () => {
  it("blocks an unlimited ERC-20 approval", async () => {
    const data = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [SPENDER, maxUint256] });
    const result = await analyzeTransaction({ transaction: { to: TO, value: "0", data } });
    expect(result.safe).toBe(false);
    expect(result.riskLevel).toBe("high");
    expect(result.findings.some((f) => f.code === "ERC20_APPROVAL_UNLIMITED")).toBe(true);
  });

  it("allows a plain native transfer to an EOA", async () => {
    const result = await analyzeTransaction({ transaction: { to: EOA, value: "1000", data: "0x" } });
    expect(result.safe).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("unwraps a multicall to catch an unlimited approval hidden inside it", async () => {
    const inner = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [SPENDER, maxUint256] });
    const outer = encodeFunctionData({ abi: multicallAbi, functionName: "multicall", args: [[inner]] });
    const result = await analyzeTransaction({ transaction: { to: TO, value: "0", data: outer } });
    expect(result.safe).toBe(false);
    expect(result.decoded.functionName).toBe("multicall");
    const finding = result.findings.find((f) => f.code === "ERC20_APPROVAL_UNLIMITED");
    expect(finding).toBeDefined();
    expect(finding?.details?.insideBatchedCall).toBe(true);
  });

  it("flags insufficient balance against the value being sent", async () => {
    mockGetBalance.mockResolvedValue(1n);
    const result = await analyzeTransaction({
      transaction: { to: EOA, value: "1000000000000000000", data: "0x" },
      userWallet: SPENDER,
    });
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.code === "INSUFFICIENT_BALANCE")).toBe(true);
  });

  it("rejects a malformed `to` address", async () => {
    await expect(
      analyzeTransaction({ transaction: { to: "not-an-address", value: "0", data: "0x" } }),
    ).rejects.toThrow(AnalyzeValidationError);
  });

  it("rejects a transaction with neither `raw` nor `to`", async () => {
    await expect(analyzeTransaction({ transaction: {} })).rejects.toThrow(AnalyzeValidationError);
  });

  it("degrades to static-only analysis when the RPC is unreachable", async () => {
    mockGetCode.mockRejectedValue(new Error("network error"));
    const data = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [SPENDER, maxUint256] });
    const result = await analyzeTransaction({ transaction: { to: TO, value: "0", data } });
    expect(result.safe).toBe(false);
    expect(result.decoded.isContract).toBe(false);
  });

  it("defaults to blockSeverity 'high' and echoes back the resolved policy", async () => {
    const result = await analyzeTransaction({ transaction: { to: EOA, value: "1000", data: "0x" } });
    expect(result.policy).toEqual({ blockSeverity: "high", ignoreCodes: [] });
  });

  it("'strict' blocks a bounded approval that 'balanced' (the default) would allow", async () => {
    const data = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [SPENDER, 1000n] });
    const withoutPolicy = await analyzeTransaction({ transaction: { to: TO, value: "0", data } });
    expect(withoutPolicy.safe).toBe(true); // ERC20_APPROVAL_GRANTED is only "medium"

    const strict = await analyzeTransaction({ transaction: { to: TO, value: "0", data }, policy: "strict" });
    expect(strict.safe).toBe(false);
    expect(strict.findings.some((f) => f.code === "ERC20_APPROVAL_GRANTED")).toBe(true);
  });

  it("'permissive' allows a high-severity finding through but still blocks critical", async () => {
    const unlimited = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [SPENDER, maxUint256] });
    const permissiveHigh = await analyzeTransaction({
      transaction: { to: TO, value: "0", data: unlimited },
      policy: "permissive",
    });
    expect(permissiveHigh.safe).toBe(true); // ERC20_APPROVAL_UNLIMITED is "high", below the "critical" threshold

    const upgrade = encodeFunctionData({ abi: upgradeToAbi, functionName: "upgradeTo", args: [SPENDER] });
    const permissiveCritical = await analyzeTransaction({
      transaction: { to: TO, value: "0", data: upgrade },
      policy: "permissive",
    });
    expect(permissiveCritical.safe).toBe(false);
    expect(permissiveCritical.findings.some((f) => f.code === "PROXY_UPGRADE_DETECTED")).toBe(true);
  });

  it("ignoreCodes suppresses a code from blocking without removing it from `findings`", async () => {
    const data = encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [SPENDER, maxUint256] });
    const result = await analyzeTransaction({
      transaction: { to: TO, value: "0", data },
      policy: { blockSeverity: "low", ignoreCodes: ["ERC20_APPROVAL_UNLIMITED", "ERC20_APPROVAL_GRANTED"] },
    });
    expect(result.safe).toBe(true);
    expect(result.findings.some((f) => f.code === "ERC20_APPROVAL_UNLIMITED")).toBe(true);
  });

  it("rejects an unknown policy preset", async () => {
    await expect(
      analyzeTransaction({ transaction: { to: EOA, value: "0", data: "0x" }, policy: "bogus" as never }),
    ).rejects.toThrow(AnalyzeValidationError);
  });

  it("rejects an invalid policy.blockSeverity", async () => {
    await expect(
      analyzeTransaction({
        transaction: { to: EOA, value: "0", data: "0x" },
        policy: { blockSeverity: "extreme" as never },
      }),
    ).rejects.toThrow(AnalyzeValidationError);
  });

  it("rejects a non-array policy.ignoreCodes", async () => {
    await expect(
      analyzeTransaction({
        transaction: { to: EOA, value: "0", data: "0x" },
        policy: { ignoreCodes: "not-an-array" as never },
      }),
    ).rejects.toThrow(AnalyzeValidationError);
  });
});
