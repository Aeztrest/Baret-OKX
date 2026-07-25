import { describe, it, expect } from "vitest";
import { priceToAtomicUnits } from "./requirements.js";

describe("priceToAtomicUnits", () => {
  it("converts a simple cent price at 6 decimals", () => {
    expect(priceToAtomicUnits("$0.01", 6)).toBe("10000");
  });

  it("handles a price with no leading dollar sign", () => {
    expect(priceToAtomicUnits("0.01", 6)).toBe("10000");
  });

  it("handles a whole-dollar price", () => {
    expect(priceToAtomicUnits("$1", 6)).toBe("1000000");
  });

  it("handles a price with more fractional digits than the asset supports (truncates)", () => {
    expect(priceToAtomicUnits("$0.0123456789", 6)).toBe("12345");
  });

  it("handles a larger whole-plus-fraction amount", () => {
    expect(priceToAtomicUnits("$1.50", 6)).toBe("1500000");
  });

  it("handles zero decimals", () => {
    expect(priceToAtomicUnits("$5", 0)).toBe("5");
  });
});
