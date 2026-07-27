export type Severity = "low" | "medium" | "high" | "critical";

export type RiskFinding = {
  code: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
};

export type TransactionInput = {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  raw?: string;
};

/** Preset shorthand for `blockSeverity`. `balanced` reproduces the service's default (no `policy`) behavior exactly. */
export type PolicyPreset = "strict" | "balanced" | "permissive";

export type Policy = {
  /** Findings at or above this severity cause `safe: false`. Default (no policy, or "balanced"): "high". */
  blockSeverity?: Severity;
  /** Finding codes that never contribute to the block decision — they still appear in `findings`, just can't block. */
  ignoreCodes?: string[];
};

export type CheckRequest = {
  network?: string;
  rpcUrl?: string;
  transaction: TransactionInput;
  userWallet?: string;
  policy?: Policy | PolicyPreset;
};

export type CheckResult = {
  safe: boolean;
  riskLevel: Severity | "none";
  findings: RiskFinding[];
  reasons: string[];
  decoded: {
    to?: string;
    value: string;
    functionSelector?: string;
    functionName?: string;
    isContract?: boolean;
  };
  network: string;
  chainId: number;
  summary: string;
  /** The policy actually applied — echoed back so a caller can confirm what took effect. */
  policy: { blockSeverity: Severity; ignoreCodes: string[] };
};
