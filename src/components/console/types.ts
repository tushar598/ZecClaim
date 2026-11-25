import type { PublicCampaign, PublicClaimSlot, PublicVoucher } from "@/lib/security/publicViews";
import type { AuditEventType, ChainTxCheck } from "@/types";
import type { BatchExporterProps } from "@/components/zcash/BatchExporter";

export interface PayoutView {
  batchRun: number;
  chunkIndex: number;
  recipients: number;
  txid: string;
  check: ChainTxCheck;
  recordedAt?: string;
}

export interface ConsoleEvent {
  eventType: AuditEventType;
  details: Record<string, unknown>;
  txid?: string | null;
  blockHeight?: number | null;
  timestamp: string;
}

/** GET /api/campaigns/[id] (public projection, no hashes or addresses). */
export interface CampaignResponse {
  campaign: PublicCampaign & { clawbackAt?: string | null };
  isDemo: boolean;
  slots: {
    total: number;
    claimed: number;
    unclaimed: number;
    submitted: number;
    locked: number;
    paid: number;
    purged: number;
    list: PublicClaimSlot[];
  };
  vouchers: {
    total: number;
    ackConfirmed: number;
    withSweepEvidence: number;
    disputed: number;
    clawedBack: number;
    list: PublicVoucher[];
  };
  payouts: PayoutView[];
  auditEvents: ConsoleEvent[];
}

export interface BatchResult {
  chunks: BatchExporterProps["chunks"];
  zingoScript: string;
  totalRecipients: number;
  totalActions: number;
  totalEstimatedFeeZat: number;
  totalChunks: number;
  batchRun: number;
  isReexport: boolean;
}

export type AdminPost = (
  url: string,
  body: Record<string, unknown>
) => Promise<{ ok: boolean; status: number; json: Record<string, unknown> }>;

export interface PanelProps {
  data: CampaignResponse;
  campaignId: string;
  adminPost: AdminPost;
  refresh: () => Promise<void>;
}
