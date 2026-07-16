export const CHECK_TRANSACTION_TOOL = "check_transaction";

// Plain-object tool metadata reused by both the real MCP server (mcp/server.ts)
// and the free REST discovery route (/v1/mcp/tools), so the two can't drift.
export const TOOL_CATALOG = [
  {
    name: CHECK_TRANSACTION_TOOL,
    description:
      "Analyze an EVM transaction BEFORE signing it. Returns safe:true/false, a risk level, and findings " +
      "(unlimited approvals, setApprovalForAll grants, EIP-2612 permits, ownership/proxy-upgrade calls, " +
      "insufficient balance, blocklist hits). Paid per call via x402.",
    inputSchema: {
      type: "object",
      required: ["transaction"],
      properties: {
        network: {
          type: "string",
          description: 'e.g. "eip155:8453" (Base). Defaults to the service network.',
        },
        rpcUrl: { type: "string", description: "Optional RPC override for the target chain." },
        transaction: {
          type: "object",
          description: "Either { raw: '0x...' } (signed or unsigned serialized tx) or { to, value, data }.",
          properties: {
            raw: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            value: { type: "string" },
            data: { type: "string" },
          },
        },
        userWallet: { type: "string", description: "0x address to check native balance against." },
      },
    },
  },
  {
    name: "health",
    description: "Returns Vetra service status. Free, not payment-gated.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;
