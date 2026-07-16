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

export type CheckRequest = {
  network?: string;
  rpcUrl?: string;
  transaction: TransactionInput;
  userWallet?: string;
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
};
