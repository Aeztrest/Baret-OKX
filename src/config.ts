export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  usdcAddress: string;
  usdcDecimals: number;
};

// A small set of well-known EVM chains, keyed by `eip155:<chainId>` (the
// network id format x402 and OKX's payment protocol both use). Callers can
// override the RPC via `rpcUrl` in the request body, and add chains by
// extending this map or setting VETRA_EXTRA_CHAINS (JSON) at boot.
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

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",

  x402: {
    enabled: (process.env.X402_ENABLED ?? "true").trim().toLowerCase() !== "false",
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? "https://www.x402.org/facilitator",
    payTo: process.env.X402_PAY_TO ?? "",
    network: process.env.X402_NETWORK ?? "eip155:8453",
    checkPrice: process.env.VETRA_CHECK_PRICE ?? "$0.01",
    checkPriceAtomic: process.env.VETRA_CHECK_PRICE_ATOMIC ?? "10000",
  },

  service: {
    name: "Vetra",
    description: "Pre-signature transaction safety check for AI agents.",
    version: "0.1.0",
  },
};

export function resolveChain(network?: string): ChainConfig {
  const key = network && CHAINS[network] ? network : config.x402.network;
  const chain = CHAINS[key] ?? CHAINS["eip155:8453"];
  if (!chain) throw new Error(`No chain configuration available for "${key}"`);
  return chain;
}
