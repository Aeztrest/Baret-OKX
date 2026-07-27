import { createPublicClient, http, decodeFunctionData, parseTransaction, isAddress, type Hex } from "viem";
import { resolveChain } from "./config.js";
import { KNOWN_FUNCTIONS, WRAPPER_FUNCTIONS } from "./detectors/signatures.js";
import { detectApprovalFindings, type DecodedApprovalCall } from "./detectors/approvals.js";
import {
  detectPrivilegedCallFindings,
  detectNativeTransferFinding,
  detectInsufficientBalanceFinding,
} from "./detectors/privileged.js";
import { detectReputationFinding } from "./detectors/reputation.js";
import type { CheckRequest, CheckResult, Policy, PolicyPreset, RiskFinding, Severity } from "./types.js";

export class AnalyzeValidationError extends Error {}

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const VALID_SEVERITIES = new Set<Severity>(["low", "medium", "high", "critical"]);

// `balanced` reproduces the service's original hardcoded threshold exactly —
// omitting `policy` entirely must behave identically to `policy: "balanced"`.
const PRESET_THRESHOLDS: Record<PolicyPreset, Severity> = {
  strict: "low",
  balanced: "high",
  permissive: "critical",
};

function resolvePolicy(policy: Policy | PolicyPreset | undefined): { blockSeverity: Severity; ignoreCodes: string[] } {
  if (policy === undefined) {
    return { blockSeverity: PRESET_THRESHOLDS.balanced, ignoreCodes: [] };
  }
  if (typeof policy === "string") {
    if (!(policy in PRESET_THRESHOLDS)) {
      throw new AnalyzeValidationError(
        `Invalid policy preset "${policy}". Expected one of: ${Object.keys(PRESET_THRESHOLDS).join(", ")}`,
      );
    }
    return { blockSeverity: PRESET_THRESHOLDS[policy], ignoreCodes: [] };
  }
  if (typeof policy !== "object") {
    throw new AnalyzeValidationError("`policy` must be a preset string or an object");
  }
  const blockSeverity = policy.blockSeverity ?? PRESET_THRESHOLDS.balanced;
  if (!VALID_SEVERITIES.has(blockSeverity)) {
    throw new AnalyzeValidationError(
      `Invalid policy.blockSeverity "${blockSeverity}". Expected one of: ${[...VALID_SEVERITIES].join(", ")}`,
    );
  }
  const ignoreCodes = policy.ignoreCodes ?? [];
  if (!Array.isArray(ignoreCodes) || !ignoreCodes.every((c) => typeof c === "string")) {
    throw new AnalyzeValidationError("`policy.ignoreCodes` must be an array of strings");
  }
  return { blockSeverity, ignoreCodes };
}

// A malicious approve()/setApprovalForAll() is rarely the top-level call —
// it usually rides inside a multicall or a Safe execTransaction. Unwrap a
// bounded number of levels/calls so batching can't be used to hide a finding
// from a static top-level-only decode (and can't be abused as a decode-cost
// DoS vector either).
const MAX_WRAP_DEPTH = 2;
const MAX_INNER_CALLS = 20;

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

function decodeKnownCall(data: Hex): { functionName?: string; approvalCall?: DecodedApprovalCall } {
  const selector = data.length >= 10 ? data.slice(0, 10) : undefined;
  const known = selector ? KNOWN_FUNCTIONS[selector] : undefined;
  if (!known) return {};
  try {
    const decoded = decodeFunctionData({ abi: known.abi, data });
    return {
      functionName: decoded.functionName,
      approvalCall: decodeApprovalCall(decoded.functionName, decoded.args as readonly unknown[] | undefined),
    };
  } catch {
    return { functionName: known.name };
  }
}

function tagWrapped(f: RiskFinding): RiskFinding {
  return {
    ...f,
    message: `Inside a batched call: ${f.message}`,
    details: { ...f.details, insideBatchedCall: true },
  };
}

/** Decodes `data`, unwrapping multicall/execTransaction-style wrappers up to MAX_WRAP_DEPTH. */
function analyzeCalldata(data: Hex, depth: number): RiskFinding[] {
  const selector = data.length >= 10 ? data.slice(0, 10) : undefined;
  const wrapper = selector ? WRAPPER_FUNCTIONS[selector] : undefined;

  if (wrapper && depth < MAX_WRAP_DEPTH) {
    const findings: RiskFinding[] = [];
    try {
      const decoded = decodeFunctionData({ abi: wrapper.abi, data });
      const inner = wrapper.extractInner(decoded.args as readonly unknown[]).slice(0, MAX_INNER_CALLS);
      for (const innerData of inner) {
        findings.push(...analyzeCalldata(innerData, depth + 1).map(tagWrapped));
      }
    } catch {
      // Malformed wrapper calldata — no inner findings to add, but this isn't
      // itself an error worth failing the whole analysis over.
    }
    return findings;
  }

  const { functionName, approvalCall } = decodeKnownCall(data);
  return [...detectApprovalFindings(approvalCall), ...detectPrivilegedCallFindings(functionName)];
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
  let rpcUnavailable = false;
  try {
    if (to) {
      const code = await client.getCode({ address: to as Hex });
      isContract = Boolean(code && code !== "0x");
    }
    if (req.userWallet) {
      balance = await client.getBalance({ address: req.userWallet as Hex });
    }
  } catch {
    // Degrade to static-only (calldata-based) analysis rather than failing
    // closed — but the caller needs to know isContract/balance-dependent
    // findings (NATIVE_TRANSFER_TO_CONTRACT_NO_DATA, INSUFFICIENT_BALANCE)
    // were skipped, not silently absent. Surfaced below.
    rpcUnavailable = true;
  }

  const selector = data.length >= 10 ? data.slice(0, 10) : undefined;
  const wrapperTop = selector ? WRAPPER_FUNCTIONS[selector] : undefined;
  const topDecoded = wrapperTop ? { functionName: wrapperTop.name, approvalCall: undefined } : decodeKnownCall(data);
  const { functionName, approvalCall } = topDecoded;

  const findings: RiskFinding[] = analyzeCalldata(data, 0);

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

  if (rpcUnavailable) {
    findings.push({
      code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
      severity: "low",
      message:
        "The RPC endpoint was unreachable during analysis — contract-code and balance checks were skipped. " +
        "Findings below are calldata-only; a clean result here is not a full guarantee.",
    });
  }

  // `findings` stays the complete, unfiltered evidence — policy only changes
  // which of them are allowed to cause a block, never what was observed.
  const highestSeverity = findings.reduce<Severity | undefined>((acc, f) => {
    if (!acc || SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc]) return f.severity;
    return acc;
  }, undefined);

  const { blockSeverity, ignoreCodes } = resolvePolicy(req.policy);
  const ignoreSet = new Set(ignoreCodes);
  const isBlocking = (f: RiskFinding) => !ignoreSet.has(f.code) && SEVERITY_RANK[f.severity] >= SEVERITY_RANK[blockSeverity];

  const safe = !findings.some(isBlocking);
  const reasons = findings.filter(isBlocking).map((f) => f.message);

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
    policy: { blockSeverity, ignoreCodes },
  };
}
