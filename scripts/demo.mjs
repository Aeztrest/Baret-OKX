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
// Record in Windows Terminal (not the legacy blue PowerShell console host) —
// it renders ANSI color correctly everywhere the old console host doesn't.
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
  red: (s) => (isTTY ? `\x1b[97m\x1b[41m${s}\x1b[0m` : s), // white on red
  green: (s) => (isTTY ? `\x1b[97m\x1b[42m${s}\x1b[0m` : s), // white on green
  redText: (s) => (isTTY ? `\x1b[31m\x1b[1m${s}\x1b[0m` : s),
  greenText: (s) => (isTTY ? `\x1b[32m\x1b[1m${s}\x1b[0m` : s),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, isTTY ? ms : 0));

/** Prints one character at a time — reads as "live typing", not a text dump. */
async function type(text, { speed = 16, pauseAfter = 450 } = {}) {
  if (!isTTY) {
    console.log(text);
    return;
  }
  for (const ch of text) {
    process.stdout.write(ch);
    await sleep(speed);
  }
  process.stdout.write("\n");
  await sleep(pauseAfter);
}

/** A real spinner for the real network round-trip — genuine feedback, not fake delay. */
async function withSpinner(label, promise) {
  if (!isTTY) return promise;
  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  process.stdout.write("\n");
  const timer = setInterval(() => {
    process.stdout.write(`\r${c.dim(frames[(i = (i + 1) % frames.length)])} ${label}`);
  }, 110);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
    process.stdout.write(`\r${" ".repeat(label.length + 4)}\r`);
  }
}

/** ASCII-only box (no Unicode box-drawing glyphs) — renders identically in every terminal. */
function box(lines, colorFn) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const bar = "+" + "-".repeat(width) + "+";
  console.log(colorFn(bar));
  for (const l of lines) {
    console.log(colorFn("|  " + l.padEnd(width - 2) + "|"));
  }
  console.log(colorFn(bar));
}

function clearScreen() {
  if (isTTY) process.stdout.write("\x1Bc");
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

async function scene(n, { title, intent, transaction }) {
  console.log("");
  console.log(c.bold(c.cyan(`SCENE ${n}: ${title}`)));
  console.log(c.dim("-".repeat(("SCENE " + n + ": " + title).length)));
  await sleep(300);
  await type(`agent > ${intent}`, { speed: 14 });

  const result = await withSpinner("Baret is analyzing on-chain...", checkTransaction(transaction));

  if (result.safe) {
    box(["SAFE TO SIGN"], c.green);
  } else {
    box(["BLOCKED - DO NOT SIGN"], c.red);
  }
  await sleep(300);
  await type(`baret > ${result.reasons?.[0] ?? result.summary}`, { speed: 10 });
  await type(
    result.safe ? "agent > signing and broadcasting." : "agent > refusing to sign. transaction dropped.",
    { speed: 14, pauseAfter: 500 },
  );

  if (result.payment?.transaction) {
    await type(
      `${c.amber("$0.01 USDC paid")} -> https://sepolia.basescan.org/tx/${result.payment.transaction}`,
      { speed: 6, pauseAfter: 700 },
    );
  }
  return result;
}

async function main() {
  clearScreen();
  console.log("");
  box(["B A R E T"], c.cyan);
  await sleep(400);
  await type("pre-signature safety check for AI agents", { speed: 20 });
  await type(c.dim("Agent-to-MCP  .  x402-metered  .  live on Base Sepolia"), { speed: 10, pauseAfter: 900 });

  await scene(1, {
    title: "a malicious approval",
    intent: 'about to sign approve(0x1234...7890, UNLIMITED)',
    transaction: {
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      value: "0",
      data:
        "0x095ea7b30000000000000000000000001234567890123456789012345678901234567890" +
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  });

  await sleep(500);

  await scene(2, {
    title: "a plain transfer",
    intent: "about to sign: send 0.000001 ETH",
    transaction: { to: "0x000000000000000000000000000000000000dEaD", value: "1000", data: "0x" },
  });

  console.log("");
  await type(c.dim(`$0.01 per check  .  ${BASE_URL}`), { speed: 8, pauseAfter: 400 });
  await type(c.bold("Baret - OKX.AI Agent Service Provider"), { speed: 14, pauseAfter: 0 });
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
