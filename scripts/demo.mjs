// Demo-paced terminal walkthrough for screen recording (90s OKX.AI submission
// video). Same buyer-side pattern as test-payment.mjs (x402-fetch + viem, not
// a committed dependency — install on demand, see the header comment there).
//
// Usage:
//   1. npm install --no-save x402-fetch dotenv
//   2. .env.local must have PRIVATE_KEY=0x... for a Base Sepolia wallet
//      funded with test USDC (https://faucet.circle.com)
//   3. node scripts/demo.mjs [baseUrl]   (defaults to the live deployment)
//
// Both scenes make a REAL, paid call — a "blocked" verdict is still a
// successful analysis and gets settled same as a "safe" one. Only a request
// that errors out (bad input) goes unpaid.

import { config } from "dotenv";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { baseSepolia } from "viem/chains";

config({ path: ".env.local" });

const BASE_URL = process.argv[2] ?? "https://baret-okx-api.onrender.com";
const isTTY = Boolean(process.stdout.isTTY);

const c = {
  bold: (s) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  cyan: (s) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  amber: (s) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (isTTY ? `\x1b[31m\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (isTTY ? `\x1b[32m\x1b[1m${s}\x1b[0m` : s),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, isTTY ? ms : 0));
async function line(text, delay = 700) {
  console.log(text);
  await sleep(delay);
}

if (!process.env.PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY in .env.local — see this file's header comment.");
  process.exit(1);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = createWalletClient({ account, transport: http(), chain: baseSepolia });
const fetchWithPay = wrapFetchWithPayment(fetch, client);

async function checkTransaction(transaction) {
  const res = await fetchWithPay(`${BASE_URL}/v1/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction }),
  });
  const body = await res.json();
  // REST carries the settlement confirmation in a response header, not the
  // body (the MCP tool path embeds it in the body instead — see mcp/server.ts).
  const paymentHeader = res.headers.get("x-payment-response");
  if (paymentHeader) {
    body.payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  }
  return body;
}

async function scene({ title, intent, transaction, verdictGood }) {
  console.log("");
  await line(c.bold(c.cyan(`— ${title} —`)), 500);
  await line(`${c.dim("agent:")} ${intent}`, 900);
  await line(`${c.dim("→")} asking Baret before signing...`, 700);
  await line(`${c.dim("→")} no payment on file — paying $0.01 USDC and retrying...`, 900);

  const result = await checkTransaction(transaction);

  if (result.safe) {
    await line(c.green("✅ SAFE") + `  ${result.summary}`, 800);
    await line(`${c.dim("agent decision:")} signing and broadcasting.`, 700);
  } else {
    await line(c.red("🛑 BLOCKED") + `  ${result.reasons?.[0] ?? result.summary}`, 900);
    await line(`${c.dim("agent decision:")} refusing to sign.`, 700);
  }

  if (result.payment?.transaction) {
    await line(
      `${c.dim("paid:")} ${c.amber("$0.01 USDC")} → ${c.dim("https://sepolia.basescan.org/tx/" + result.payment.transaction)}`,
      600,
    );
  }
  return result;
}

async function main() {
  console.log("");
  await line(c.bold("BARET") + c.dim("  —  pre-signature safety check for AI agents"), 900);
  await line(c.dim("Agent-to-MCP · x402-metered · live on Base Sepolia"), 1100);

  await scene({
    title: "Scenario 1: a malicious approval",
    intent: 'approve(0x1234…7890, UNLIMITED) — "let this spender take everything, forever"',
    transaction: {
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      value: "0",
      data:
        "0x095ea7b30000000000000000000000001234567890123456789012345678901234567890" +
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  });

  await scene({
    title: "Scenario 2: a plain transfer",
    intent: "send 0.000001 ETH to a normal address",
    transaction: { to: "0x000000000000000000000000000000000000dEaD", value: "1000", data: "0x" },
  });

  console.log("");
  await line(c.dim("$0.01 per check · " + BASE_URL), 700);
  await line(c.dim("Baret — OKX.AI Agent Service Provider submission"), 0);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
