import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type McpPaymentContext } from "./server.js";
import { verifyX402 } from "../x402/gate.js";
import { CHECK_TRANSACTION_TOOL } from "./tools.js";

type JsonRpcBody = { method?: string; params?: { name?: string } };

/**
 * Real MCP endpoint (Streamable HTTP transport, stateless — a fresh
 * McpServer + transport per request, no session store). `tools/call` for the
 * paid tool is gated by x402 at the HTTP layer, before the JSON-RPC message
 * ever reaches the transport: this is the "x402-compliant endpoint" shape
 * OKX's Agent-to-MCP mode expects. Discovery (`initialize`, `tools/list`) is
 * free so agents can inspect the tool before deciding to pay. Payment is
 * only *verified* here — settlement happens inside the tool handler itself,
 * after the analysis actually succeeds (see mcp/server.ts).
 */
export function registerMcpRoute(app: FastifyInstance): void {
  app.post("/mcp", async (req, reply) => {
    const body = req.body as JsonRpcBody | undefined;
    const isPaidToolCall = body?.method === "tools/call" && body?.params?.name === CHECK_TRANSACTION_TOOL;

    let paymentContext: McpPaymentContext | undefined;
    if (isPaidToolCall) {
      const verified = await verifyX402(req, reply, "/mcp#check_transaction");
      if (!verified) return; // 402/400 already sent
      if (verified.paymentPayload !== undefined && verified.requirements) {
        paymentContext = { paymentPayload: verified.paymentPayload, requirements: verified.requirements };
      }
    }

    reply.hijack();
    const mcpServer = createMcpServer(paymentContext);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      req.log.error({ err }, "MCP request handling failed");
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "Content-Type": "application/json" });
        reply.raw.end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }),
        );
      }
    }
  });

  app.get("/mcp", async (_req, reply) => {
    reply.code(405).header("Allow", "POST").send({ error: "Method not allowed. Use POST for MCP JSON-RPC." });
  });
}
