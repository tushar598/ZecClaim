"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Restores the sandbox fixtures (sandbox campaign only; the API refuses anything else). */
export function SandboxReset({ campaignId }: { campaignId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const res = await fetch("/api/demo/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId }),
          });
          if (!res.ok) throw new Error("reset failed");
          window.location.reload();
        } catch {
          setState("error");
        }
      }}
    >
      <RotateCcw className="w-3.5 h-3.5" />
      {state === "busy" ? "Resetting..." : state === "error" ? "Retry reset" : "Reset sandbox"}
    </Button>
  );
}

/** Shown only on the sandbox campaign's pages: what is fixture data, and a way back. */
export function JudgeSandboxStrip({ campaignId }: { campaignId: string }) {
  return (
    <section className="neo-inset rounded-[16px] px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-5 h-5 text-amber-fg shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-ink">Judge sandbox</p>
          <p className="text-[12px] text-subtle">
            Seeded testnet campaign with labeled fixture data. Txids you record here are checked against the live testnet node.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <Link href="/sandbox" className="neo-btn rounded-[9px] h-8 px-3 inline-flex items-center text-xs font-semibold text-ink">
          Sandbox steps
        </Link>
        <SandboxReset campaignId={campaignId} />
      </div>
    </section>
  );
}
