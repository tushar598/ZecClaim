import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeeActionMeter } from "@/components/zcash/FeeActionMeter";
import { BatchExporter } from "@/components/zcash/BatchExporter";

export default async function AdminCampaignDashboard(props: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await props.params;

  // Mock data for Phase 0 scaffolding
  const mockChunks = [
    {
      batchIndex: 0,
      recipients: [
        { address: "u1sample...", amountZat: 50_000_000, memo: "ZecClaim Payout" },
      ],
      actionsCount: 2,
      estimatedFeeZat: 2000,
      zip321Uri: "zcash:u1sample...?amount=0.50000000",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-mono text-amber-500 uppercase">Organizer Admin Portal</span>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            Campaign: {campaignId}
          </h1>
        </div>
        <div className="flex space-x-2">
          <Button variant="danger" size="sm">
            Execute 1-Click PII Scrub
          </Button>
          <a href={`/proof/${campaignId}`}>
            <Button variant="outline" size="sm">
              View Public Proof Portal
            </Button>
          </a>
        </div>
      </div>

      <FeeActionMeter totalRecipients={1} totalActions={2} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Queue Management &amp; Batch Lock</CardTitle>
            <CardDescription>
              Lock submissions to compute deterministic chunking and ZIP 2009 fees.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-400">
              When the queue is locked, payouts are split into safe transactions (&lt;= 300 actions).
            </p>
            <Button variant="primary" size="sm">
              Lock Queue &amp; Generate Batch
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Printable Desk QR Slips (Lane 1)</CardTitle>
            <CardDescription>
              Export high-contrast slip sheets for physical meetup check-ins.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-400">
              Slips display Public Card IDs and wallet guidance without logging private keys.
            </p>
            <Button variant="secondary" size="sm">
              Download Slip Sheet PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      <BatchExporter
        campaignTitle={`Campaign ${campaignId}`}
        chunks={mockChunks}
        zingoScript="#!/usr/bin/env bash\necho 'Scaffold script for Phase 0';"
      />
    </div>
  );
}
