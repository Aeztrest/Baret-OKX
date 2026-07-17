import type { FastifyInstance } from "fastify";
import { analyzeTransaction, AnalyzeValidationError } from "./analyze.js";
import { withX402, isPaymentRequired } from "./x402/gate.js";
import { config } from "./config.js";
import { TOOL_CATALOG } from "./mcp/tools.js";
import type { CheckRequest } from "./types.js";

export function registerRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({
    status: "ok",
    service: config.service.name,
    version: config.service.version,
    x402Enabled: isPaymentRequired(),
    network: config.x402.network,
  }));

  // Free discovery route — lets an agent inspect the tool/pricing before
  // deciding whether to pay, mirroring `tools/list` on the MCP endpoint.
  app.get("/v1/mcp/tools", async () => ({ tools: TOOL_CATALOG }));

  app.post("/v1/check", async (req, reply) => {
    const body = req.body as CheckRequest | undefined;
    if (!body || typeof body !== "object" || !body.transaction) {
      return reply.code(400).send({ error: "Request body must include `transaction`." });
    }

    const result = await withX402(req, reply, "/v1/check", () => analyzeTransaction(body));
    if (result === undefined) return; // 402/400 already sent by the gate
    return reply.send(result);
  });

  // Free, unmetered mirror of /v1/check for the landing-page demo widget
  // only. Real integrations should use the paid /v1/check or the MCP tool.
  // Tighter rate limit than the global default: it's unmetered and calls a
  // real RPC, so it's the cheapest route to abuse.
  app.post(
    "/v1/demo-check",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = req.body as CheckRequest | undefined;
      if (!body || typeof body !== "object" || !body.transaction) {
        return reply.code(400).send({ error: "Request body must include `transaction`." });
      }
      return reply.send(await analyzeTransaction(body));
    },
  );

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AnalyzeValidationError) {
      return reply.code(400).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: "Internal error" });
  });
}
