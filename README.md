# Vetra

**Pre-signature transaction safety check for AI agents.** Pay-per-call, x402-metered API and MCP tool that answers one question before an agent signs an EVM transaction: is this safe?

Vetra never signs, holds keys, or submits anything on-chain. It decodes the transaction, checks on-chain state (contract code, balances), and returns `safe: true/false`, a risk level, and human-readable findings — unlimited approvals, blanket NFT operator grants (`setApprovalForAll`), EIP-2612 permits, proxy-upgrade / ownership-transfer calls, insufficient balance, and blocklist hits.

## Why

Agents that hold or move funds increasingly sign transactions autonomously. A single blind `approve()` or `setApprovalForAll()` can hand a malicious contract standing authority to drain a wallet. Vetra is a small, focused check an agent calls immediately before signing — paid per call, so there's no account or API key to provision.

## Quickstart

```bash
npm install
cp .env.example .env   # edit as needed; X402_ENABLED=false for local dev without a receiving wallet
npm run dev
```

Server listens on `http://localhost:8787` by default. `GET /` serves the landing page/docs; `GET /health` is a liveness check.

## REST API

```
POST /v1/check
Content-Type: application/json

{
  "network": "eip155:8453",
  "transaction": { "to": "0x...", "value": "0", "data": "0x095ea7b3..." }
}
```

`transaction` accepts either `{ raw: "0x..." }` (a signed or unsigned serialized tx) or a `{ from?, to, value?, data? }` object. Optional `userWallet` checks native balance sufficiency.

Without a valid `X-PAYMENT` header the endpoint returns `HTTP 402` with an x402 `PaymentRequirements` challenge (`x402Version: 1` JSON body — one of the formats OKX's agent payment protocol detects natively). `GET /v1/mcp/tools` is a free discovery route (pricing + schema, no payment required).

## MCP (Agent-to-MCP)

A real [Model Context Protocol](https://modelcontextprotocol.io) server, Streamable HTTP transport, at `POST /mcp`. `initialize` and `tools/list` are free; `tools/call` for `check_transaction` is gated by x402 at the HTTP layer (a 402 is returned before the call reaches the tool). A `health` tool is free.

## x402 payment gate

`src/x402/` implements the standard x402 v1 flow against a facilitator (`/verify`, `/settle`) — defaults to the public facilitator at `x402.org`, swappable via `X402_FACILITATOR_URL` (e.g. an OKX-provided facilitator, once available). Price and payout wallet are set via `X402_PAY_TO`, `VETRA_CHECK_PRICE(_ATOMIC)`. If `X402_PAY_TO` is unset the gate no-ops, so the service still runs for local development.

## Risk detectors

See `src/detectors/`. Each detector is a small, independent function over decoded calldata + on-chain state — see the table on the landing page (`public/index.html#api`) for the current finding codes and severities. `src/detectors/reputation.ts` supports an optional external blocklist feed via `VETRA_BLOCKLIST_URL` (ships empty by default rather than a stale hardcoded list).

## Production hardening

- Environment is validated with zod at boot (`src/config.ts`) — an invalid `X402_PAY_TO` or unknown `X402_NETWORK` fails fast with a clear error instead of misbehaving at the first real payment.
- `@fastify/helmet` (CSP tuned for the static landing page) and `@fastify/rate-limit` (120 req/min global; 20 req/min on the unmetered `/v1/demo-check`) are enabled by default.
- Graceful shutdown on `SIGTERM`/`SIGINT`. Set `TRUST_PROXY=true` behind a reverse proxy (Render, etc.) so rate-limiting and logs see the real client IP.
- `npm test` runs 26 vitest tests (detectors + `analyzeTransaction` against a mocked RPC client); `.github/workflows/ci.yml` runs typecheck + test + build on every push/PR.

## Deploy

`render.yaml` is a Render Blueprint (`npm install && npm run build` / `npm start`, health check on `/health`). Any Node 20+ host works the same way — it's a single Fastify process with no external dependencies beyond an EVM RPC and (optionally) an x402 facilitator.

## OKX.AI ASP registration notes

Reference: [okx.ai/tutorial/asp](https://www.okx.ai/tutorial/asp). Registration itself is agent-guided (have your email + an Agentic Wallet login ready); these are the facts to have on hand when you go through it:

- **Service type:** Agent-to-MCP (A2MCP) — single-purpose, per-call metered. Not Agent-to-Agent (no negotiation/escrow).
- **Name:** Vetra
- **One-line description:** Pre-signature transaction safety check for AI agents — call before you sign, get safe/unsafe + reasons.
- **Endpoint:** `https://<your-deployment>/mcp` (MCP, Streamable HTTP) — or `https://<your-deployment>/v1/check` if OKX's A2MCP registration wants a plain REST resource instead of a raw MCP endpoint.
- **Pricing:** $0.01 USDC per call (`VETRA_CHECK_PRICE`), x402-compliant paid endpoint.
- **Free discovery:** `GET /v1/mcp/tools`, MCP `tools/list`, `GET /health`.
- **Payment compliance:** generic x402 v1 (`x402Version` in the 402 response body) — one of the three formats OKX's payment protocol dispatcher recognizes alongside `WWW-Authenticate: Payment` and `PAYMENT-REQUIRED` (v2). Swap in the OKX Payment SDK / a different facilitator via `X402_FACILITATOR_URL` if OKX requires it for listing.
- **Review:** ~24h per OKX; once approved it's listed on okx.ai. Before/if review lags, the service is still reachable via its Agent ID.

## License

MIT.
