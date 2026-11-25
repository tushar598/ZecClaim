"use client";

import React, { useState } from "react";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/field";
import { CheckRow } from "@/components/ui/choice";
import { Badge } from "@/components/ui/badge";
import { DEMO_ADMIN_SECRET } from "@/lib/demo/constants";

/**
 * Sign-in for the organizer console. The secret is checked by the server
 * (POST /api/campaigns/[id]/verify) before any management control is shown.
 */
export function SecretGate({
  campaignId,
  title,
  network,
  isDemo,
  error,
  onSubmit,
}: {
  campaignId: string;
  title: string;
  network: string;
  isDemo: boolean;
  error: string | null;
  onSubmit: (secret: string, remember: boolean) => Promise<void>;
}) {
  const [secret, setSecret] = useState(isDemo ? DEMO_ADMIN_SECRET : "");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-lg mx-auto py-4 sm:py-10 animate-fade-up">
      <form
        className="neo-card rounded-[20px] p-6 sm:p-8 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!secret.trim()) return;
          setBusy(true);
          await onSubmit(secret.trim(), remember);
          setBusy(false);
        }}
      >
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl neo-icon-btn flex items-center justify-center text-mint shrink-0">
            <Lock className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-[0.04em] text-mint-hover">Organizer console</p>
            <h1 className="text-[19px] font-bold text-ink truncate">{title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={network === "mainnet" ? "shielded" : "sapling"}>{network}</Badge>
          {isDemo && <Badge variant="warning">Sandbox</Badge>}
          <Badge variant="default">{campaignId}</Badge>
        </div>

        {isDemo && (
          <Notice tone="warning" className="font-normal">
            Sandbox campaign: its public secret is filled in below. Real campaigns need the secret shown when they were created.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        <div>
          <Label htmlFor="admin-secret">Organizer secret</Label>
          <Input
            id="admin-secret"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="sec_..."
            className="font-mono text-[12.5px]"
            autoFocus
          />
        </div>
        <CheckRow id="remember" checked={remember} onChange={setRemember} title="Remember on this device.">
          Otherwise it is kept for this tab only.
        </CheckRow>
        <Button type="submit" variant="solid" size="lg" className="w-full" disabled={busy || !secret.trim()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {busy ? "Checking..." : "Open console"}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px] text-subtle">
          <span>Lost the secret? It cannot be recovered; only its hash is stored.</span>
          <ButtonLink href={`/proof/${campaignId}`} variant="ghost" size="sm">
            Public proof portal
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
