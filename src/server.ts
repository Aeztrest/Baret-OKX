import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerMcpRoute } from "./mcp/http.js";
import { loadBlocklist } from "./detectors/reputation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const app = Fastify({
    logger: true,
    trustProxy: config.trustProxy,
  });

  await app.register(helmet, {
    // Landing page is a same-origin static page with inline styles/scripts
    // and a Google Fonts stylesheet; a default strict CSP would break both.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  });

  // Global ceiling against abuse; the paid endpoints are already
  // self-limiting via x402 cost, so this mainly protects the free discovery
  // and demo routes (and the RPC quota behind them).
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  await app.register(cors, { origin: true });
  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/",
  });

  registerRoutes(app);
  registerMcpRoute(app);

  await loadBlocklist(config.blocklistUrl);

  if (config.x402.enabled && !config.x402.payTo) {
    app.log.warn("X402_ENABLED is true but X402_PAY_TO is unset — the payment gate is running in no-op mode.");
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
