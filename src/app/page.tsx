import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { TrustBoundaryBanner } from "@/components/proof/TrustBoundaryBanner";

export default function HomePage() {
  return (
    <div className="flex flex-col space-y-8">
      {/* Hero Section */}
      <div className="border border-slate-800 bg-slate-900 p-8 rounded-none relative">
        <div className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs px-2 py-0.5 mb-4">
          Post-NU7 Zcash Consensus (Nov 2026)
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">
          Dual-Mode QR Payout &amp; ZecHub DAO Proof Portal
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed mb-6">
          100% non-custodial coordination, preflight validation, and DAO verification layer.
          Distribute offline meetup gift cards (ZIP 324) or batch online bounty claims (ZIP 321)
          with strict shielded address enforcement and cryptographic audit trails.
        </p>

        <div className="flex flex-wrap gap-3">
          <a href="/proof/demo-nu7-campaign">
            <Button size="lg" variant="primary">
              Enter 2-Min NU7 Judge Sandbox
            </Button>
          </a>
          <a href="/admin/new">
            <Button size="lg" variant="secondary">
              Create New Campaign
            </Button>
          </a>
        </div>
      </div>

      <TrustBoundaryBanner />

      {/* Dual Lanes Architecture Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lane 1 */}
        <Card amberAccent>
          <CardHeader>
            <div className="text-xs font-mono text-amber-500 uppercase">Lane 1</div>
            <CardTitle>Offline Meetups &amp; Zero-Wallet Onboarding</CardTitle>
            <CardDescription>
              Bearer Preset QRs based on the Vizor ZIP 324 standard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Import a Vizor gift card CSV batch, generate printable desk slips with Public Card IDs,
              and verify redemption via note nullifiers and encrypted-memo ACK codes.
            </p>
            <ul className="text-xs font-mono text-slate-400 space-y-1 list-disc list-inside">
              <li>Up to 50 cards per batch (split-custody ready)</li>
              <li>Pre-funded with ZIP 2009 sweep fee buffer</li>
              <li>Nullifier-gated ACK-XXXX verification</li>
              <li>Dispute tripwire for already-swept cards</li>
            </ul>
          </CardContent>
        </Card>

        {/* Lane 2 */}
        <Card amberAccent>
          <CardHeader>
            <div className="text-xs font-mono text-amber-500 uppercase">Lane 2</div>
            <CardTitle>Online Bounties &amp; Async Payouts</CardTitle>
            <CardDescription>
              Blind Claim Links &amp; 1-Tx Auto-Chunked Shielded Batch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Recipients submit shielded addresses through blind links. Strict client and server ZIP 316
              preflight blocks transparent leakage. Auto-chunks into safe batches of &lt;= 300 actions.
            </p>
            <ul className="text-xs font-mono text-slate-400 space-y-1 list-disc list-inside">
              <li>Zero OAuth: No social-handle-to-address linkage</li>
              <li>Hard-rejects transparent t1... and mixed UAs</li>
              <li>Auto-chunked &lt;= 300 actions (below 330 cap)</li>
              <li>1-Click DB Scrub with SHA-256 attestation</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
