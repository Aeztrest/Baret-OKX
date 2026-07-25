import { config, resolveChain } from "../config.js";

export type X402PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

/**
 * Converts a "$0.01"-style price label into base-unit atomic amount, using
 * plain string/BigInt arithmetic (never floating point, which can't
 * represent most decimal fractions exactly and would risk over/undercharging
 * by a unit at the boundary).
 */
export function priceToAtomicUnits(price: string, decimals: number): string {
  const cleaned = price.trim().replace(/^\$/, "");
  const [wholeRaw, fracRaw = ""] = cleaned.split(".");
  const whole = wholeRaw || "0";
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals) || "0";
  const atomic = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
  return atomic.toString();
}

/**
 * Builds the x402 PaymentRequirements advertised on a 402 response, in the
 * plain-JSON "x402Version: 1" body shape (one of the formats OKX's agent
 * payment protocol detects natively, alongside the WWW-Authenticate and
 * PAYMENT-REQUIRED header variants).
 *
 * `resource` must be an absolute URL and `network` must be the x402 "exact"
 * EVM scheme's short chain name (e.g. "base", not our own API's
 * `eip155:8453` selector) — the reference x402 client library validates both
 * strictly and silently rejects anything else.
 */
export function buildCheckPaymentRequirements(resourceUrl: string): X402PaymentRequirements {
  const chain = resolveChain(config.x402.network);
  if (!chain.x402Network) {
    throw new Error(`Chain "${config.x402.network}" has no x402Network mapping — cannot build PaymentRequirements`);
  }
  const amount = priceToAtomicUnits(config.x402.checkPrice, chain.usdcDecimals);
  return {
    scheme: "exact",
    network: chain.x402Network,
    asset: chain.usdcAddress,
    payTo: config.x402.payTo,
    amount,
    maxAmountRequired: amount,
    resource: resourceUrl,
    description: "Baret pre-signature transaction safety check",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
    extra: {
      chainId: chain.chainId,
      decimals: chain.usdcDecimals,
      priceLabel: config.x402.checkPrice,
      // EIP-712 domain for the USDC contract — required for clients to sign
      // a valid EIP-3009 authorization (see ChainConfig.usdcDomainName).
      name: chain.usdcDomainName,
      version: chain.usdcDomainVersion,
    },
  };
}
