// Buyer-side test client for the x402 payment gate. NOT used by the deployed
// service (kept out of package.json's own dependencies on purpose — its
// wallet-connector transitive deps are heavy and irrelevant to a raw-key CLI
// script) — this simulates what an agent does: hit the paid endpoint, get a
// 402, sign an x402 payment with a real wallet, retry, get the result.
//
// Usage:
//   1. npm install --no-save x402-fetch dotenv
//   2. Put a funded testnet wallet's private key in .env.local as PRIVATE_KEY=0x...
//      (Base Sepolia; get free test USDC from https://faucet.circle.com)
//   3. node scripts/test-payment.mjs https://baret-okx-api.onrender.com/v1/check
//
// Never commit .env.local. Never paste a private key anywhere but this file's
// local env var.

import { config } from "dotenv";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { baseSepolia } from "viem/chains";

config({ path: ".env.local" });

const { PRIVATE_KEY } = process.env;
const url = process.argv[2];

if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY. Put it in .env.local (never commit that file).");
  process.exit(1);
}
if (!url) {
  console.error("Usage: npm run test:payment -- <url>");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const client = createWalletClient({ account, transport: http(), chain: baseSepolia });

console.log(`Paying from ${account.address} -> ${url}`);

const fetchWithPay = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPay(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    transaction: {
      to: "0x000000000000000000000000000000000000dEaD",
      value: "1000",
      data: "0x",
    },
  }),
});

console.log("status:", res.status);
const paymentResponseHeader = res.headers.get("x-payment-response");
if (paymentResponseHeader) {
  console.log("settlement:", JSON.parse(Buffer.from(paymentResponseHeader, "base64").toString("utf8")));
}
console.log("body:", await res.json());
