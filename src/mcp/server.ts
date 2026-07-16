import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeTransaction, AnalyzeValidationError } from "../analyze.js";
import { config } from "../config.js";
import { CHECK_TRANSACTION_TOOL } from "./tools.js";

const transactionShape = z.object({
  raw: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  value: z.string().optional(),
  data: z.string().optional(),
});

/** Fresh MCP server + tool registration per request (stateless HTTP transport). */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "vetra", version: config.service.version });

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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        const message = e instanceof AnalyzeValidationError ? e.message : "Analysis failed";
        return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
      }
    },
  );

  server.registerTool(
    "health",
    { title: "Health", description: "Vetra service status. Free, not payment-gated.", inputSchema: {} },
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
