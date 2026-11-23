"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AckSubmissionPage() {
  const [cardId, setCardId] = useState("");
  const [ackCode, setAckCode] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Phase 4 will execute POST /api/vouchers/ack
    setSubmitted(true);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <span className="text-xs font-mono text-amber-500 uppercase">Lane 1: Note Memo Verification</span>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          Submit Memo ACK Code
        </h1>
        <p className="text-xs text-slate-400">
          After sweeping your physical gift card slip, locate the unique ACK-XXXX code inside the note&apos;s encrypted memo.
        </p>
      </div>

      <Card amberAccent>
        <CardHeader>
          <CardTitle>Nullifier-Gated Verification</CardTitle>
          <CardDescription>
            The portal will verify that the card&apos;s note nullifier has been spent on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="p-4 bg-amber-950/40 border border-amber-800 text-amber-300 text-xs font-mono space-y-2">
              <div className="font-bold text-sm">ACK Code Verified</div>
              <p>Your gift card redemption has been cryptographically confirmed on the DAO Proof Portal.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">Public Card ID</label>
                <input
                  type="text"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  placeholder="e.g., CARD-01"
                  className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Decrypted Memo ACK Code</label>
                <input
                  type="text"
                  value={ackCode}
                  onChange={(e) => setAckCode(e.target.value)}
                  placeholder="e.g., ACK-7824"
                  className="w-full bg-slate-950 border border-slate-700 p-2 text-slate-100 rounded-none focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <Button type="submit" variant="primary" className="w-full">
                Verify Redemption on DAO Portal
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
