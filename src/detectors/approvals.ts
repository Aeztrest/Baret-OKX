import type { RiskFinding } from "../types.js";
import { UNLIMITED_THRESHOLD } from "./signatures.js";

export type DecodedApprovalCall =
  | { kind: "approve" | "increaseAllowance"; spender: string; amount: bigint }
  | { kind: "setApprovalForAll"; operator: string; approved: boolean }
  | { kind: "permit"; owner: string; spender: string; value: bigint };

export function detectApprovalFindings(call: DecodedApprovalCall | undefined): RiskFinding[] {
  if (!call) return [];
  const findings: RiskFinding[] = [];

  if (call.kind === "approve" || call.kind === "increaseAllowance") {
    if (call.amount === 0n) return findings; // a zero-amount approve is a revoke, not a grant
    const unlimited = call.amount >= UNLIMITED_THRESHOLD;
    findings.push({
      code: "ERC20_APPROVAL_GRANTED",
      severity: "medium",
      message: `Grants ${call.spender} an allowance${unlimited ? " (effectively unlimited)" : ""} over an ERC-20 token.`,
      details: { spender: call.spender, amount: call.amount.toString() },
    });
    if (unlimited) {
      findings.push({
        code: "ERC20_APPROVAL_UNLIMITED",
        severity: "high",
        message: `Approval to ${call.spender} is effectively unlimited — that spender could drain the full token balance at any time in the future.`,
        details: { spender: call.spender },
      });
    }
    return findings;
  }

  if (call.kind === "setApprovalForAll") {
    if (!call.approved) return findings; // revoking all-access is protective
    findings.push({
      code: "SET_APPROVAL_FOR_ALL",
      severity: "high",
      message: `Grants ${call.operator} approval to transfer ALL tokens in this collection, present and future.`,
      details: { operator: call.operator },
    });
    return findings;
  }

  if (call.kind === "permit") {
    const unlimited = call.value >= UNLIMITED_THRESHOLD;
    findings.push({
      code: "PERMIT_SIGNATURE_DETECTED",
      severity: unlimited ? "high" : "medium",
      message: `Submits an off-chain EIP-2612 permit that grants ${call.spender} an allowance${unlimited ? " (effectively unlimited)" : ""} without requiring a separate on-chain approve.`,
      details: { spender: call.spender, amount: call.value.toString() },
    });
    return findings;
  }

  return findings;
}
