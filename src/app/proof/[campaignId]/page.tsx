import React from "react";
import { UfvkLedgerTable } from "@/components/proof/UfvkLedgerTable";
import { ScrubAttestationCard } from "@/components/proof/ScrubAttestationCard";
import { TrustBoundaryBanner } from "@/components/proof/TrustBoundaryBanner";

export default async function ProofPortalPage(props: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await props.params;

  // Mock fixtures for Phase 0 scaffold
  const mockEntries = [
    {
      id: "CARD-01",
      type: "Offline ZIP 324 Slip",
      amountZat: 5_000_000,
      nullifierHex: "9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a",
      memoAck: "ACK-7824",
      status: "ACK_CONFIRMED",
      timestamp: new Date().toISOString(),
    },
    {
      id: "SLOT-01",
      type: "Online Bounty Batch",
      amountZat: 50_000_000,
      status: "PURGED",
      timestamp: new Date().toISOString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-mono text-amber-500 uppercase">ZecHub DAO Public Audit</span>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            Proof Portal: {campaignId}
          </h1>
        </div>
        <div className="font-mono text-xs text-slate-400">
          Consensus: NU7 (Nov 2026) | Branch: 0x77190AD9
        </div>
      </div>

      <TrustBoundaryBanner />

      <UfvkLedgerTable
        entries={mockEntries}
        ufvkAnchor="uview1demoanchor9876543210zyxwvutsrqponmlkjihgfedcba"
      />

      <ScrubAttestationCard
        executedAt={new Date().toISOString()}
        purgedCount={1}
        setHash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      />
    </div>
  );
}
