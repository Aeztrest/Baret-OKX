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
 * Builds the x402 PaymentRequirements advertised on a 402 response, in the
 * plain-JSON "x402Version: 1" body shape (one of the formats OKX's agent
 * payment protocol detects natively, alongside the WWW-Authenticate and
 * PAYMENT-REQUIRED header variants).
 */
export function buildCheckPaymentRequirements(resource: string): X402PaymentRequirements {
  const chain = resolveChain(config.x402.network);
  return {
    scheme: "exact",
    network: config.x402.network,
    asset: chain.usdcAddress,
    payTo: config.x402.payTo,
    amount: config.x402.checkPriceAtomic,
    maxAmountRequired: config.x402.checkPriceAtomic,
    resource,
    description: "Baret pre-signature transaction safety check",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
    extra: { chainId: chain.chainId, decimals: chain.usdcDecimals, priceLabel: config.x402.checkPrice },
  };
}
