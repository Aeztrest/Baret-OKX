import { describe, it, expect } from "vitest";
import { detectApprovalFindings } from "./approvals.js";

describe("detectApprovalFindings", () => {
  it("flags a bounded approve as a medium-severity grant only", () => {
    const findings = detectApprovalFindings({ kind: "approve", spender: "0xabc", amount: 1_000n });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("ERC20_APPROVAL_GRANTED");
    expect(findings[0]?.severity).toBe("medium");
  });

  it("flags an unlimited approve as both a grant and a high-severity unlimited finding", () => {
    const findings = detectApprovalFindings({ kind: "approve", spender: "0xabc", amount: (1n << 200n) });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("ERC20_APPROVAL_GRANTED");
    expect(codes).toContain("ERC20_APPROVAL_UNLIMITED");
    expect(findings.find((f) => f.code === "ERC20_APPROVAL_UNLIMITED")?.severity).toBe("high");
  });

  it("does not flag a zero-amount approve (a revoke)", () => {
    expect(detectApprovalFindings({ kind: "approve", spender: "0xabc", amount: 0n })).toHaveLength(0);
  });

  it("flags setApprovalForAll(true) as high severity", () => {
    const findings = detectApprovalFindings({ kind: "setApprovalForAll", operator: "0xop", approved: true });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("SET_APPROVAL_FOR_ALL");
    expect(findings[0]?.severity).toBe("high");
  });

  it("does not flag setApprovalForAll(false) — revoking is protective", () => {
    expect(detectApprovalFindings({ kind: "setApprovalForAll", operator: "0xop", approved: false })).toHaveLength(0);
  });

  it("flags an unlimited permit as high severity", () => {
    const findings = detectApprovalFindings({ kind: "permit", owner: "0xo", spender: "0xs", value: (1n << 200n) });
    expect(findings[0]?.code).toBe("PERMIT_SIGNATURE_DETECTED");
    expect(findings[0]?.severity).toBe("high");
  });

  it("flags a bounded permit as medium severity", () => {
    const findings = detectApprovalFindings({ kind: "permit", owner: "0xo", spender: "0xs", value: 500n });
    expect(findings[0]?.severity).toBe("medium");
  });

  it("returns no findings when there is no decoded call", () => {
    expect(detectApprovalFindings(undefined)).toHaveLength(0);
  });
});
