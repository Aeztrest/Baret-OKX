import { z } from "zod";
import { isAddress } from "viem";

export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  usdcAddress: string;
  usdcDecimals: number;
};

// A small set of well-known EVM chains, keyed by `eip155:<chainId>` (the
// network id format x402 and OKX's payment protocol both use). Callers can
// override the RPC via `rpcUrl` in the request body.
export const CHAINS: Record<string, ChainConfig> = {
  "eip155:1": {
    chainId: 1,
    name: "ethereum",
    rpcUrl: process.env.RPC_URL_ETHEREUM ?? "https://eth.llamarpc.com",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcDecimals: 6,
  },
  "eip155:8453": {
    chainId: 8453,
    name: "base",
    rpcUrl: process.env.RPC_URL_BASE ?? "https://mainnet.base.org",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDecimals: 6,
  },
  "eip155:84532": {
    chainId: 84532,
    name: "base-sepolia",
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA ?? "https://sepolia.base.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcDecimals: 6,
  },
  "eip155:137": {
    chainId: 137,
    name: "polygon",
    rpcUrl: process.env.RPC_URL_POLYGON ?? "https://polygon-rpc.com",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdcDecimals: 6,
  },
  "eip155:10143": {
    chainId: 10143,
    name: "monad-testnet",
    rpcUrl: process.env.RPC_URL_MONAD_TESTNET ?? "https://testnet-rpc.monad.xyz",
    usdcAddress: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
    usdcDecimals: 6,
  },
};

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
  HOST: z.string().optional(),
  NODE_ENV: z.string().optional(),

  X402_ENABLED: z.string().optional(),
  X402_FACILITATOR_URL: z.string().url().optional(),
  X402_PAY_TO: z.string().optional(),
  X402_NETWORK: z.string().optional(),
  VETRA_CHECK_PRICE: z.string().optional(),
  VETRA_CHECK_PRICE_ATOMIC: z.string().regex(/^\d+$/, "must be a base-unit integer string").optional(),

  VETRA_BLOCKLIST_URL: z.string().url().optional(),
  TRUST_PROXY: z.string().optional(),
});

/**
 * Validates process.env and builds the immutable app config. Fails fast with
 * a clear message on boot rather than surfacing a confusing error later —
 * e.g. a malformed X402_PAY_TO would otherwise only break the first real
 * payment attempt in production.
 */
function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;

  const x402Enabled = (e.X402_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const payTo = e.X402_PAY_TO?.trim() ?? "";
  const network = e.X402_NETWORK?.trim() || "eip155:8453";

  if (x402Enabled && payTo) {
    if (!isAddress(payTo)) {
      throw new Error(`X402_PAY_TO is not a valid EVM address: "${payTo}"`);
    }
  }
  if (network && !CHAINS[network]) {
    throw new Error(
      `X402_NETWORK "${network}" is not a configured chain. Known networks: ${Object.keys(CHAINS).join(", ")}`,
    );
  }

  return {
    port: e.PORT ?? 8787,
    host: e.HOST ?? "0.0.0.0",
    nodeEnv: e.NODE_ENV ?? "development",
    trustProxy: (e.TRUST_PROXY ?? "false").trim().toLowerCase() === "true",

    x402: {
      enabled: x402Enabled,
      facilitatorUrl: e.X402_FACILITATOR_URL ?? "https://www.x402.org/facilitator",
      payTo,
      network,
      checkPrice: e.VETRA_CHECK_PRICE ?? "$0.01",
      checkPriceAtomic: e.VETRA_CHECK_PRICE_ATOMIC ?? "10000",
    },

    blocklistUrl: e.VETRA_BLOCKLIST_URL,

    service: {
      name: "Vetra",
      description: "Pre-signature transaction safety check for AI agents.",
      version: "0.1.0",
    },
  };
}

export const config = loadConfig();

export function resolveChain(network?: string): ChainConfig {
  const key = network && CHAINS[network] ? network : config.x402.network;
  const chain = CHAINS[key] ?? CHAINS["eip155:8453"];
  if (!chain) throw new Error(`No chain configuration available for "${key}"`);
  return chain;
}
