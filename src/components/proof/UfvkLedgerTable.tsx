import React from "react";
import { Table, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface LedgerEntry {
  id: string;
  type: string;
  amountZat: number;
  nullifierHex?: string;
  memoAck?: string;
  status: string;
  timestamp: string;
}

export interface UfvkLedgerTableProps {
  entries: LedgerEntry[];
  ufvkAnchor: string;
}

export function UfvkLedgerTable({ entries, ufvkAnchor }: UfvkLedgerTableProps) {
  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span>UFVK Anchor: {ufvkAnchor.slice(0, 24)}...{ufvkAnchor.slice(-8)}</span>
        <span className="text-emerald-400">Read-Only Cryptographic Inflow Ledger</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Card / Slot ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount (ZEC)</TableHead>
            <TableHead>Spend Nullifier</TableHead>
            <TableHead>Memo ACK</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <tbody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-bold text-white">{entry.id}</TableCell>
              <TableCell>{entry.type}</TableCell>
              <TableCell className="text-amber-400">
                {(entry.amountZat / 100_000_000).toFixed(4)}
              </TableCell>
              <TableCell className="text-slate-500 truncate max-w-[120px]">
                {entry.nullifierHex ? `${entry.nullifierHex.slice(0, 10)}...` : "Unspent"}
              </TableCell>
              <TableCell>
                {entry.memoAck ? (
                  <Badge variant="ack">{entry.memoAck}</Badge>
                ) : (
                  <span className="text-slate-600">-</span>
                )}
              </TableCell>
              <TableCell>
                {entry.status === "SPENT" && <Badge variant="nullifier">Spent Nullifier</Badge>}
                {entry.status === "ACK_CONFIRMED" && <Badge variant="ack">ACK Confirmed</Badge>}
                {entry.status === "UNCLAIMED" && <Badge variant="default">Unclaimed</Badge>}
                {entry.status === "PURGED" && <Badge variant="purged">PII Purged</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
