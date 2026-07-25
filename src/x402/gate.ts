import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { buildCheckPaymentRequirements, type X402PaymentRequirements } from "./requirements.js";
import { FacilitatorClient, type SettleResult } from "./facilitator-client.js";

const facilitator = new FacilitatorClient();

export const isPaymentRequired = (): boolean => config.x402.enabled && Boolean(config.x402.payTo);

/** x402's PaymentRequirements.resource must be an absolute URL, not a path. */
function resourceUrl(req: FastifyRequest, resourcePath: string): string {
  return `${req.protocol}://${req.hostname}${resourcePath}`;
}

/**
 * Verify-only half of the x402 flow, for callers that need to interleave
 * arbitrary work (e.g. handing off to the MCP transport, or running the
 * priced work itself) between verify and settle — settling only belongs
 * after the work actually succeeds, so a caller that gets an analysis error
 * was never charged for it. Returns `null` after already sending a 402/400
 * response, or the decoded payment payload (plus requirements, for the later
 * `settlePayment` call) once verified valid.
 *
 * When payment isn't required (x402 disabled, or no payout wallet
 * configured), this never touches `buildCheckPaymentRequirements` at all —
 * that function requires the configured chain to have a real x402Network
 * mapping, which isn't guaranteed (or relevant) for e.g. local analysis-only
 * runs against a chain x402 doesn't support settlement on.
 */
export async function verifyX402(
  req: FastifyRequest,
  reply: FastifyReply,
  resource: string,
): Promise<{ paymentPayload: unknown; requirements?: X402PaymentRequirements } | null> {
  if (!isPaymentRequired()) {
    return { paymentPayload: undefined };
  }

  const requirements = buildCheckPaymentRequirements(resourceUrl(req, resource));
  const paymentHeader = req.headers["x-payment"];

  if (typeof paymentHeader !== "string" || paymentHeader.length === 0) {
    reply.code(402).send({ x402Version: 1, error: "Payment required", accepts: [requirements] });
    return null;
  }

  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  } catch {
    reply.code(400).send({ error: "Malformed X-PAYMENT header" });
    return null;
  }

  const verifyResult = await facilitator.verify(paymentPayload, requirements);
  if (!verifyResult.isValid) {
    reply.code(402).send({
      x402Version: 1,
      error: verifyResult.invalidReason ?? "Payment verification failed",
      accepts: [requirements],
    });
    return null;
  }

  return { paymentPayload, requirements };
}

/** Settles a previously-verified payment. Best-effort: returns `undefined` (never throws) on failure. */
export async function settlePayment(
  paymentPayload: unknown,
  requirements: X402PaymentRequirements,
): Promise<SettleResult | undefined> {
  try {
    return await facilitator.settle(paymentPayload, requirements);
  } catch {
    return undefined;
  }
}

/** Settle a previously-verified payment and attach `X-PAYMENT-RESPONSE`. Best-effort: logs, never throws. */
export async function settleX402(
  req: FastifyRequest,
  reply: FastifyReply,
  paymentPayload: unknown,
  requirements: X402PaymentRequirements | undefined,
): Promise<void> {
  if (!isPaymentRequired() || paymentPayload === undefined || !requirements) return;
  const settleResult = await settlePayment(paymentPayload, requirements);
  if (!settleResult) {
    req.log.warn("x402 settle failed after successful verify");
    return;
  }
  // Raw Node API rather than reply.header(): must work both on the normal
  // REST path and on the MCP path, where the reply is later hijacked and
  // written to directly by the MCP transport (bypassing Fastify's own
  // header store).
  reply.raw.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(settleResult)).toString("base64"));
}

/**
 * Wraps a paid route handler with the full x402 challenge/verify/settle flow.
 * Settles only after `handler` succeeds — if it throws, the caller was
 * verified-but-never-charged. If `X402_PAY_TO` isn't configured, the gate
 * no-ops (useful for local dev) so the service still runs without a
 * receiving wallet configured.
 */
export async function withX402<T>(
  req: FastifyRequest,
  reply: FastifyReply,
  resource: string,
  handler: () => Promise<T>,
): Promise<T | undefined> {
  const verified = await verifyX402(req, reply, resource);
  if (!verified) return undefined;

  const result = await handler();
  await settleX402(req, reply, verified.paymentPayload, verified.requirements);
  return result;
}
