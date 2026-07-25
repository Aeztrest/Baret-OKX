import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeTransaction, AnalyzeValidationError } from "../analyze.js";
import { config } from "../config.js";
import { settlePayment } from "../x402/gate.js";
import type { X402PaymentRequirements } from "../x402/requirements.js";
import { CHECK_TRANSACTION_TOOL } from "./tools.js";

const transactionShape = z.object({
  raw: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  value: z.string().optional(),
  data: z.string().optional(),
});

export type McpPaymentContext = { paymentPayload: unknown; requirements: X402PaymentRequirements };

/**
 * Fresh MCP server + tool registration per request (stateless HTTP
 * transport). `paymentContext` is a verified-but-not-yet-settled x402
 * payment for this call, if the tool being invoked is the paid one — settled
 * here, after `analyzeTransaction` actually succeeds, so a call that turns
 * out to be invalid (bad address, malformed tx) is never charged. The
 * settlement confirmation rides along in the tool's own result content
 * rather than an HTTP header: by the time we know whether analysis
 * succeeded, the Streamable HTTP transport has already started writing the
 * response and headers can no longer be attached.
 */
export function createMcpServer(paymentContext?: McpPaymentContext): McpServer {
  const server = new McpServer({ name: "baret", version: config.service.version });

  server.registerTool(
    CHECK_TRANSACTION_TOOL,
    {
      title: "Check Transaction",
      description:
        "Analyze an EVM transaction BEFORE signing it. Returns safe:true/false, a risk level, and findings.",
      inputSchema: {
        network: z.string().optional(),
        rpcUrl: z.string().optional(),
        transaction: transactionShape,
        userWallet: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const result = await analyzeTransaction(args);
        let payment: unknown;
        if (paymentContext) {
          const settled = await settlePayment(paymentContext.paymentPayload, paymentContext.requirements);
          payment = settled ?? { success: false, errorReason: "settlement failed after a valid payment check" };
        }
        return { content: [{ type: "text", text: JSON.stringify({ ...result, payment }, null, 2) }] };
      } catch (e) {
        // Never settled: an invalid request (bad address, malformed tx) was
        // verified as payable but the priced work itself never ran.
        const message = e instanceof AnalyzeValidationError ? e.message : "Analysis failed";
        return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
      }
    },
  );

  server.registerTool(
    "health",
    { title: "Health", description: "Baret service status. Free, not payment-gated.", inputSchema: {} },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "ok", service: config.service.name, version: config.service.version }),
        },
      ],
    }),
  );

  return server;
}
