import React from "react";

export function TrustBoundaryBanner() {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-none text-xs text-slate-300">
      <div className="flex items-center space-x-2 text-amber-500 font-bold mb-1">
        <span className="w-2 h-2 bg-amber-500 rounded-none inline-block"></span>
        <span className="uppercase tracking-wider">Cryptographic Trust Boundary &amp; Non-Custodial Disclosure</span>
      </div>
      <p className="leading-relaxed text-slate-400">
        ZecClaim is 100% non-custodial software. This server never receives or holds spending keys.
        The Campaign Unified Full Viewing Key (UFVK) enables watch-only auditing of note nullifiers and
        funding verification without granting spending authority. Payout transactions are signed locally by the
        organizer.
      </p>
    </div>
  );
}
