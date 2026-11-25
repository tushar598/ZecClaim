/**
 * Judge sandbox switch (client-safe).
 *
 * The sandbox is one seeded, clearly labeled testnet campaign that lets a judge try every step
 * without a funded wallet. It is the only place fixture data exists. Set
 * NEXT_PUBLIC_ZECCLAIM_SANDBOX=off to remove it entirely (no seeding, no links, no demo secret).
 * The variable is inlined into the client bundle at build time, so both sides agree.
 */
export function isSandboxEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ZECCLAIM_SANDBOX !== "off";
}
