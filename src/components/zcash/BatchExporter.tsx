"use client";

import React, { useState } from "react";
import { Download } from "lucide-react";
import { PayoutChunk } from "@/types";
import { Segmented } from "@/components/ui/tabs";
import { CopyButton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export interface BatchExporterProps {
  chunks: Pick<PayoutChunk, "batchIndex" | "recipients" | "actionsCount" | "estimatedFeeZat" | "zip321Uri">[];
  zingoScript: string;
  fileStem: string;
}

/** Signing artifacts for the organizer's own wallet: ZIP 321 URIs per transaction, or one zingo-cli script. */
export function BatchExporter({ chunks, zingoScript, fileStem }: BatchExporterProps) {
  const [format, setFormat] = useState<"zip321" | "zingo">("zip321");

  const downloadScript = () => {
    const blob = new Blob([zingoScript], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileStem}-payout.sh`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-bold text-ink">Signing artifacts</p>
          <p className="text-[12px] text-subtle">
            {chunks.length} transaction{chunks.length === 1 ? "" : "s"}, each at most 300 actions. Sign in your own wallet.
          </p>
        </div>
        <Segmented
          ariaLabel="Export format"
          value={format}
          onChange={setFormat}
          options={[
            { key: "zip321", label: "ZIP 321 URI" },
            { key: "zingo", label: "zingo-cli script" },
          ]}
        />
      </div>

      {format === "zip321" ? (
        <div className="space-y-3">
          {chunks.map((chunk) => (
            <div key={chunk.batchIndex} className="neo-inset-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-ink">
                  Transaction {chunk.batchIndex + 1}: {chunk.recipients.length} recipient{chunk.recipients.length === 1 ? "" : "s"} ·{" "}
                  {chunk.actionsCount} actions · {chunk.estimatedFeeZat.toLocaleString("en-US")} zat fee
                </p>
                <p className="font-mono text-[11px] text-subtle truncate mt-0.5" title={chunk.zip321Uri}>
                  {chunk.zip321Uri}
                </p>
              </div>
              <CopyButton value={chunk.zip321Uri} label={`Copy ZIP 321 URI for transaction ${chunk.batchIndex + 1}`} />
            </div>
          ))}
          <p className="text-[11.5px] text-subtle">Paste into Zingo PC (or any ZIP 321 wallet) as a payment request.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <pre className="neo-inset-sm rounded-xl p-4 text-[11.5px] font-mono text-ink-soft overflow-x-auto max-h-72 leading-relaxed">
            {zingoScript}
          </pre>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={downloadScript}>
              <Download className="w-3.5 h-3.5" /> Download script
            </Button>
            <CopyButton value={zingoScript} label="Copy zingo-cli script" />
            <span className="text-[11.5px] text-subtle">Runs quicksend per transaction, waiting for change to confirm between them.</span>
          </div>
        </div>
      )}
    </div>
  );
}
