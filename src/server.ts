import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerMcpRoute } from "./mcp/http.js";
import { loadBlocklist } from "./detectors/reputation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/",
  });

  registerRoutes(app);
  registerMcpRoute(app);

  await loadBlocklist(process.env.VETRA_BLOCKLIST_URL);

  if (config.x402.enabled && !config.x402.payTo) {
    app.log.warn("X402_ENABLED is true but X402_PAY_TO is unset — the payment gate is running in no-op mode.");
  }

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
