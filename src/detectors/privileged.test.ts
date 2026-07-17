import { describe, it, expect } from "vitest";
import {
  detectPrivilegedCallFindings,
  detectNativeTransferFinding,
  detectInsufficientBalanceFinding,
} from "./privileged.js";

describe("detectPrivilegedCallFindings", () => {
  it("flags transferOwnership as high severity", () => {
    const findings = detectPrivilegedCallFindings("transferOwnership");
    expect(findings[0]?.code).toBe("OWNERSHIP_TRANSFER_DETECTED");
    expect(findings[0]?.severity).toBe("high");
  });

  it("flags upgradeTo and upgradeToAndCall as critical", () => {
    expect(detectPrivilegedCallFindings("upgradeTo")[0]?.severity).toBe("critical");
    expect(detectPrivilegedCallFindings("upgradeToAndCall")[0]?.code).toBe("PROXY_UPGRADE_DETECTED");
  });

  it("flags changeAdmin as critical", () => {
    expect(detectPrivilegedCallFindings("changeAdmin")[0]?.code).toBe("PROXY_ADMIN_CHANGE_DETECTED");
  });

  it("returns nothing for an unknown or missing function name", () => {
    expect(detectPrivilegedCallFindings("transfer")).toHaveLength(0);
    expect(detectPrivilegedCallFindings(undefined)).toHaveLength(0);
  });
});

describe("detectNativeTransferFinding", () => {
  it("flags native value sent to a contract with empty calldata", () => {
    const f = detectNativeTransferFinding({ value: 1n, data: "0x", to: "0xabc", toIsContract: true });
    expect(f?.code).toBe("NATIVE_TRANSFER_TO_CONTRACT_NO_DATA");
    expect(f?.severity).toBe("low");
  });

  it("does not flag when the recipient is not a contract", () => {
    expect(detectNativeTransferFinding({ value: 1n, data: "0x", to: "0xabc", toIsContract: false })).toBeUndefined();
  });

  it("does not flag when calldata is present (a real function call)", () => {
    expect(detectNativeTransferFinding({ value: 1n, data: "0x1234", to: "0xabc", toIsContract: true })).toBeUndefined();
  });

  it("does not flag a zero-value call", () => {
    expect(detectNativeTransferFinding({ value: 0n, data: "0x", to: "0xabc", toIsContract: true })).toBeUndefined();
  });
});

describe("detectInsufficientBalanceFinding", () => {
  it("flags when value exceeds balance", () => {
    const f = detectInsufficientBalanceFinding({ value: 100n, balance: 10n });
    expect(f?.code).toBe("INSUFFICIENT_BALANCE");
    expect(f?.severity).toBe("high");
  });

  it("does not flag when balance covers value", () => {
    expect(detectInsufficientBalanceFinding({ value: 10n, balance: 100n })).toBeUndefined();
  });

  it("does not flag when balance is unknown (RPC unavailable)", () => {
    expect(detectInsufficientBalanceFinding({ value: 10n, balance: undefined })).toBeUndefined();
  });
});
