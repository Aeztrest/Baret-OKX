import { config } from "../config.js";
import type { X402PaymentRequirements } from "./requirements.js";

export type VerifyResult = { isValid: boolean; invalidReason?: string; payer?: string };
export type SettleResult = { success: boolean; txHash?: string; networkId?: string; errorReason?: string };

/**
 * Thin HTTP client for an x402 facilitator (verify + settle). Defaults to the
 * public facilitator at x402.org — swap X402_FACILITATOR_URL for a
 * self-hosted or OKX-provided facilitator without touching call sites.
 */
export class FacilitatorClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async verify(paymentPayload: unknown, requirements: X402PaymentRequirements): Promise<VerifyResult> {
    return (await this.post("/verify", { paymentPayload, paymentRequirements: requirements })) as VerifyResult;
  }

  async settle(paymentPayload: unknown, requirements: X402PaymentRequirements): Promise<SettleResult> {
    return (await this.post("/settle", { paymentPayload, paymentRequirements: requirements })) as SettleResult;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const url = `${config.x402.facilitatorUrl.replace(/\/+$/, "")}${path}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`facilitator ${path} returned HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }
}
