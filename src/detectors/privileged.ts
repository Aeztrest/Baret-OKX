import type { RiskFinding } from "../types.js";

export function detectPrivilegedCallFindings(functionName: string | undefined): RiskFinding[] {
  if (!functionName) return [];
  const findings: RiskFinding[] = [];

  if (functionName === "transferOwnership") {
    findings.push({
      code: "OWNERSHIP_TRANSFER_DETECTED",
      severity: "high",
      message: "Transfers ownership of a contract to a new address.",
    });
  }

  if (functionName === "upgradeTo" || functionName === "upgradeToAndCall") {
    findings.push({
      code: "PROXY_UPGRADE_DETECTED",
      severity: "critical",
      message: "Upgrades a proxy's implementation contract — the new code can redefine all contract behavior, including custody of funds.",
    });
  }

  if (functionName === "changeAdmin") {
    findings.push({
      code: "PROXY_ADMIN_CHANGE_DETECTED",
      severity: "critical",
      message: "Changes the admin of a proxy contract, which controls who can upgrade its implementation.",
    });
  }

  return findings;
}

export function detectNativeTransferFinding(input: {
  value: bigint;
  data: string;
  to?: string;
  toIsContract?: boolean;
}): RiskFinding | undefined {
  if (input.value <= 0n || input.data !== "0x" || !input.to || !input.toIsContract) return undefined;
  return {
    code: "NATIVE_TRANSFER_TO_CONTRACT_NO_DATA",
    severity: "low",
    message: `Sends native value to contract ${input.to} with no calldata — if it has no payable fallback/receive function, this can revert or strand funds.`,
    details: { to: input.to, valueWei: input.value.toString() },
  };
}

export function detectInsufficientBalanceFinding(input: {
  value: bigint;
  balance?: bigint;
}): RiskFinding | undefined {
  if (input.balance === undefined) return undefined;
  if (input.value <= input.balance) return undefined;
  return {
    code: "INSUFFICIENT_BALANCE",
    severity: "high",
    message: "Transaction value exceeds the sender's current native balance — it would fail on-chain.",
    details: { value: input.value.toString(), balance: input.balance.toString() },
  };
}
