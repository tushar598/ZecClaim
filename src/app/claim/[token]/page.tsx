"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AddressPreflightInput } from "@/components/zcash/AddressPreflightInput";
import { Button } from "@/components/ui/button";

export default function ClaimSlotPage() {
  const [address, setAddress] = useState("");
  const [isValidShielded, setIsValidShielded] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidShielded) return;
    setSubmitted(true);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <span className="text-xs font-mono text-amber-500 uppercase">Lane 2: Blind Claim</span>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          Claim Shielded Bounty Payout
        </h1>
        <p className="text-xs text-slate-400">
          Zero-identity claim link. No OAuth, no social handles. Paste your shielded Unified Address below.
        </p>
      </div>

      <Card amberAccent>
        <CardHeader>
          <CardTitle>Shielded Address Submission</CardTitle>
          <CardDescription>
            Strict ZIP 316 preflight will validate your address instantly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-mono space-y-2">
              <div className="font-bold text-sm">Claim Slot Successfully Locked</div>
              <p>Your shielded address has been validated and queued for batch execution.</p>
              <p className="text-slate-400 text-[11px]">
                Upon payout broadcast, the organizer will execute the 1-Click PII Scrub to erase your address.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <AddressPreflightInput
                value={address}
                onChange={(addr, valid) => {
                  setAddress(addr);
                  setIsValidShielded(valid);
                }}
              />

              <Button
                type="submit"
                variant="primary"
                disabled={!isValidShielded}
                className="w-full"
              >
                Submit Shielded Address
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
