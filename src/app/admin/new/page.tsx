"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NewCampaignPage() {
  const [title, setTitle] = useState("");
  const [lane, setLane] = useState<"OFFLINE_ZIP324" | "ONLINE_BATCH" | "HYBRID">("ONLINE_BATCH");
  const [ufvk, setUfvk] = useState("");
  const [fundingTxid, setFundingTxid] = useState("");
  const [totalFundedZat, setTotalFundedZat] = useState(100_000_000);
  const [slotCount, setSlotCount] = useState(10);
  const [clawbackAddress, setClawbackAddress] = useState("");
  const [clawbackExpiryHeight, setClawbackExpiryHeight] = useState(3_300_000);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Phase 2 will execute the POST /api/campaigns mutation
    alert("Phase 0 Scaffold: Campaign registration will be executed in Phase 2.");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          Create New ZecClaim Campaign
        </h1>
        <p className="text-xs text-slate-400">
          Register your read-only Unified Full Viewing Key (UFVK) anchor before distributing any claims.
        </p>
      </div>

      <Card amberAccent>
        <CardHeader>
          <CardTitle>Campaign Trust Anchor Setup</CardTitle>
          <CardDescription>
            All fields are enforced via strict Zod schema validation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
            <div>
              <label className="block text-slate-400 mb-1">Campaign Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., ZecHub India Meetup Nov 2026"
                className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Disbursement Lane</label>
              <select
                value={lane}
                onChange={(e) => setLane(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
              >
                <option value="ONLINE_BATCH">Lane 2: Online Bounties (Direct Batch Payout)</option>
                <option value="OFFLINE_ZIP324">Lane 1: Offline Meetup (ZIP 324 Gift Slips)</option>
                <option value="HYBRID">Hybrid Lane (Both Online &amp; Offline)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Unified Full Viewing Key (uview... / Read-Only)
              </label>
              <input
                type="text"
                value={ufvk}
                onChange={(e) => setUfvk(e.target.value)}
                placeholder="uview1..."
                className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Funding Transaction ID</label>
                <input
                  type="text"
                  value={fundingTxid}
                  onChange={(e) => setFundingTxid(e.target.value)}
                  placeholder="64-character hex"
                  className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Total Funded (Satoshis)</label>
                <input
                  type="number"
                  value={totalFundedZat}
                  onChange={(e) => setTotalFundedZat(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Clawback Return Address (DAO)</label>
                <input
                  type="text"
                  value={clawbackAddress}
                  onChange={(e) => setClawbackAddress(e.target.value)}
                  placeholder="u1... (Shielded UA)"
                  className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Expiry Block Height</label>
                <input
                  type="number"
                  value={clawbackExpiryHeight}
                  onChange={(e) => setClawbackExpiryHeight(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" className="w-full">
                Anchor Campaign &amp; Generate Trust Portal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
