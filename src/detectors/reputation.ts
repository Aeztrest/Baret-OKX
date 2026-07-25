import type { RiskFinding } from "../types.js";

// Pluggable address blocklist. Ships empty — wire a real threat feed by
// setting BARET_BLOCKLIST_URL to a JSON array of lowercase 0x addresses
// (fetched once at boot and cached in-process). We intentionally do not
// ship hardcoded "known scammer" addresses: an unverified, unmaintained list
// goes stale fast and gives a false sense of coverage.
let blocklist = new Set<string>();

export async function loadBlocklist(url?: string): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const list = (await res.json()) as unknown;
    if (Array.isArray(list)) {
      blocklist = new Set(list.filter((a): a is string => typeof a === "string").map((a) => a.toLowerCase()));
    }
  } catch {
    // Fail open: reputation is an advisory layer, never the sole gate.
  }
}

export function detectReputationFinding(address: string | undefined): RiskFinding | undefined {
  if (!address) return undefined;
  if (!blocklist.has(address.toLowerCase())) return undefined;
  return {
    code: "ADDRESS_ON_BLOCKLIST",
    severity: "critical",
    message: `${address} matches an entry on the configured threat-intel blocklist.`,
    details: { address },
  };
}
