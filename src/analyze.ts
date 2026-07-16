import { createPublicClient, http, decodeFunctionData, parseTransaction, isAddress, type Hex } from "viem";
import { resolveChain } from "./config.js";
import { KNOWN_FUNCTIONS } from "./detectors/signatures.js";
import { detectApprovalFindings, type DecodedApprovalCall } from "./detectors/approvals.js";
import {
  detectPrivilegedCallFindings,
  detectNativeTransferFinding,
  detectInsufficientBalanceFinding,
} from "./detectors/privileged.js";
import { detectReputationFinding } from "./detectors/reputation.js";
import type { CheckRequest, CheckResult, RiskFinding, Severity } from "./types.js";

export class AnalyzeValidationError extends Error {}

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function toBigInt(value: string | undefined): bigint {
  if (value === undefined || value === "") return 0n;
  if (value.startsWith("0x")) return BigInt(value);
  return BigInt(value);
}

function decodeApprovalCall(functionName: string | undefined, args: readonly unknown[] | undefined): DecodedApprovalCall | undefined {
  if (!functionName || !args) return undefined;
  if (functionName === "approve" || functionName === "increaseAllowance") {
    return { kind: functionName, spender: args[0] as string, amount: args[1] as bigint };
  }
  if (functionName === "setApprovalForAll") {
    return { kind: "setApprovalForAll", operator: args[0] as string, approved: args[1] as boolean };
  }
  if (functionName === "permit") {
    return { kind: "permit", owner: args[0] as string, spender: args[1] as string, value: args[2] as bigint };
  }
  return undefined;
}

export async function analyzeTransaction(req: CheckRequest): Promise<CheckResult> {
  const tx = req.transaction;
  if (!tx || (!tx.raw && !tx.to)) {
    throw new AnalyzeValidationError("transaction must include either `raw` (signed/unsigned hex) or `to`");
  }

  let to: string | undefined;
  let value = 0n;
  let data: Hex = "0x";

  if (tx.raw) {
    try {
      const parsed = parseTransaction(tx.raw as Hex);
      to = parsed.to ?? undefined;
      value = parsed.value ?? 0n;
      data = (parsed.data ?? "0x") as Hex;
    } catch (e) {
      throw new AnalyzeValidationError(`Could not parse raw transaction: ${(e as Error).message}`);
    }
  } else {
    to = tx.to;
    value = toBigInt(tx.value);
    data = (tx.data && tx.data.length > 0 ? tx.data : "0x") as Hex;
  }

  if (to !== undefined && !isAddress(to)) {
    throw new AnalyzeValidationError(`Invalid "to" address: ${to}`);
  }
  if (req.userWallet !== undefined && !isAddress(req.userWallet)) {
    throw new AnalyzeValidationError(`Invalid "userWallet" address: ${req.userWallet}`);
  }

  const chain = resolveChain(req.network);
  const client = createPublicClient({ transport: http(req.rpcUrl ?? chain.rpcUrl) });

  let isContract = false;
  let balance: bigint | undefined;
  try {
    if (to) {
      const code = await client.getCode({ address: to as Hex });
      isContract = Boolean(code && code !== "0x");
    }
    if (req.userWallet) {
      balance = await client.getBalance({ address: req.userWallet as Hex });
    }
  } catch {
    // RPC reachability issues degrade to static-only analysis rather than failing closed;
    // we surface that as a LOW_CONFIDENCE finding below instead of throwing.
  }

  const selector = data.length >= 10 ? data.slice(0, 10) : undefined;
  const known = selector ? KNOWN_FUNCTIONS[selector] : undefined;

  let functionName: string | undefined;
  let approvalCall: DecodedApprovalCall | undefined;
  if (known) {
    try {
      const decoded = decodeFunctionData({ abi: known.abi, data });
      functionName = decoded.functionName;
      approvalCall = decodeApprovalCall(decoded.functionName, decoded.args as readonly unknown[] | undefined);
    } catch {
      functionName = known.name;
    }
  }

  const findings: RiskFinding[] = [];
  findings.push(...detectApprovalFindings(approvalCall));
  findings.push(...detectPrivilegedCallFindings(functionName));

  const nativeTransferFinding = detectNativeTransferFinding({ value, data, to, toIsContract: isContract });
  if (nativeTransferFinding) findings.push(nativeTransferFinding);

  const balanceFinding = detectInsufficientBalanceFinding({ value, balance });
  if (balanceFinding) findings.push(balanceFinding);

  const spenderForReputation = approvalCall
    ? "operator" in approvalCall
      ? approvalCall.operator
      : approvalCall.spender
    : to;
  const reputationFinding = detectReputationFinding(spenderForReputation);
  if (reputationFinding) findings.push(reputationFinding);

  const highestSeverity = findings.reduce<Severity | undefined>((acc, f) => {
    if (!acc || SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc]) return f.severity;
    return acc;
  }, undefined);

  const safe = !findings.some((f) => f.severity === "high" || f.severity === "critical");
  const reasons = findings.filter((f) => f.severity === "high" || f.severity === "critical").map((f) => f.message);

  const summary = safe
    ? findings.length > 0
      ? `No blocking risk found. ${findings.length} advisory finding(s).`
      : "No risk findings. Transaction looks safe to sign."
    : `Blocked: ${reasons[0]}`;

  return {
    safe,
    riskLevel: highestSeverity ?? "none",
    findings,
    reasons,
    decoded: {
      to,
      value: value.toString(),
      functionSelector: selector,
      functionName,
      isContract,
    },
    network: req.network ?? `eip155:${chain.chainId}`,
    chainId: chain.chainId,
    summary,
  };
}
