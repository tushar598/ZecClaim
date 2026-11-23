"use client";

import React, { useState } from "react";
import { PayoutChunk } from "@/types";
import { Button } from "@/components/ui/button";

export interface BatchExporterProps {
  campaignTitle: string;
  chunks: PayoutChunk[];
  zingoScript: string;
}

export function BatchExporter({ campaignTitle, chunks, zingoScript }: BatchExporterProps) {
  const [activeTab, setActiveTab] = useState<"zip321" | "zingo">("zip321");
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-none">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div>
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
            Self-Custody Batch Signing Artifacts
          </h4>
          <p className="text-xs text-slate-400">
            Exported for local execution: {chunks.length} transaction chunks (&lt;= 300 actions each)
          </p>
        </div>
        <div className="flex space-x-1">
          <Button
            size="sm"
            variant={activeTab === "zip321" ? "primary" : "secondary"}
            onClick={() => setActiveTab("zip321")}
          >
            ZIP 321 URIs
          </Button>
          <Button
            size="sm"
            variant={activeTab === "zingo" ? "primary" : "secondary"}
            onClick={() => setActiveTab("zingo")}
          >
            zingo-cli Script
          </Button>
        </div>
      </div>

      {activeTab === "zip321" ? (
        <div className="flex flex-col space-y-3">
          {chunks.map((chunk, idx) => (
            <div key={idx} className="bg-slate-950 p-3 border border-slate-800 font-mono text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-amber-400 font-bold">
                  Chunk {chunk.batchIndex + 1} ({chunk.recipients.length} recipients | {chunk.actionsCount} actions | {chunk.estimatedFeeZat} zat fee)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(chunk.zip321Uri)}
                >
                  {copied ? "Copied URI" : "Copy ZIP 321 URI"}
                </Button>
              </div>
              <p className="text-slate-400 truncate text-[11px]">{chunk.zip321Uri}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(zingoScript)}
            >
              {copied ? "Copied Script" : "Copy Full Shell Script"}
            </Button>
          </div>
          <pre className="bg-slate-950 p-4 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-64">
            {zingoScript}
          </pre>
        </div>
      )}
    </div>
  );
}
