import React from "react";
import { Eraser } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconTile, KeyValueRow } from "@/components/ui/misc";

export interface ScrubAttestationCardProps {
  executedAt: string;
  purgedCount: number;
  setHash: string;
  stillStored: number;
}

/**
 * The scrub attestation is a SHA-256 commitment over the sorted set of purged addresses.
 * It lets a recipient who knows the full set check it, and it timestamps the purge. It is
 * not a proof that every copy (backups, logs) was deleted, and the copy says so.
 */
export function ScrubAttestationCard({ executedAt, purgedCount, setHash, stillStored }: ScrubAttestationCardProps) {
  return (
    <section className="neo-card rounded-[18px] p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile tone="mint">
            <Eraser className="w-5 h-5" />
          </IconTile>
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">Address scrub</h2>
            <p className="text-[12.5px] text-subtle mt-0.5">{new Date(executedAt).toUTCString()}</p>
          </div>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <Badge variant="purged">
            {purgedCount} address{purgedCount === 1 ? "" : "es"} purged
          </Badge>
          <Badge variant={stillStored > 0 ? "warning" : "shielded"}>
            {stillStored} still stored
          </Badge>
        </span>
      </div>
      <KeyValueRow label="SHA-256 of the sorted purged address set" value={setHash} wrap />
      <p className="text-[12px] text-subtle leading-relaxed">
        Recipient addresses were overwritten in the ZecClaim database. This hash commits to exactly which set was purged;
        it cannot prove that database backups no longer hold them. &quot;Still stored&quot; counts addresses submitted
        since the last scrub. Anyone holding the campaign&apos;s full viewing key can still see payout recipients, which is
        why ZecClaim publishes only its fingerprint by default.
      </p>
    </section>
  );
}
