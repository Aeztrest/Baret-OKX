import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { buildCheckPaymentRequirements } from "./requirements.js";
import { FacilitatorClient } from "./facilitator-client.js";

const facilitator = new FacilitatorClient();

export const isPaymentRequired = (): boolean => config.x402.enabled && Boolean(config.x402.payTo);

/**
 * Verify-only half of the x402 flow, for callers that need to interleave
 * arbitrary work (e.g. handing off to the MCP transport) between verify and
 * settle. Returns `null` after already sending a 402/400 response, or the
 * decoded payment payload (plus requirements, for the later `settleX402`
 * call) once verified valid.
 */
export async function verifyX402(
  req: FastifyRequest,
  reply: FastifyReply,
  resource: string,
): Promise<{ paymentPayload: unknown; requirements: ReturnType<typeof buildCheckPaymentRequirements> } | null> {
  if (!isPaymentRequired()) {
    return { paymentPayload: undefined, requirements: buildCheckPaymentRequirements(resource) };
  }

  const requirements = buildCheckPaymentRequirements(resource);
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

/** Settle a previously-verified payment and attach `X-PAYMENT-RESPONSE`. Best-effort: logs, never throws. */
export async function settleX402(
  req: FastifyRequest,
  reply: FastifyReply,
  paymentPayload: unknown,
  requirements: ReturnType<typeof buildCheckPaymentRequirements>,
): Promise<void> {
  if (!isPaymentRequired() || paymentPayload === undefined) return;
  try {
    const settleResult = await facilitator.settle(paymentPayload, requirements);
    // Raw Node API rather than reply.header(): must work both on the normal
    // REST path and on the MCP path, where the reply is later hijacked and
    // written to directly by the MCP transport (bypassing Fastify's own
    // header store).
    reply.raw.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(settleResult)).toString("base64"));
  } catch (e) {
    req.log.warn({ err: e }, "x402 settle failed after successful verify");
  }
}

/**
 * Wraps a paid route handler with the full x402 challenge/verify/settle flow.
 * If `X402_PAY_TO` isn't configured, the gate no-ops (useful for local dev)
 * so the service still runs without a receiving wallet configured.
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
