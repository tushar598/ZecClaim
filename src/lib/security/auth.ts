import { NextRequest } from "next/server";
import crypto from "crypto";
import { verifyAdminSecret, DEMO_ADMIN_SECRET_HASH, DEMO_PEPPER } from "@/lib/security/tokens";
import { getRepo } from "@/lib/db/repo";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";
import { checkRateLimit, clientIp } from "@/lib/security/rateLimit";

export interface AdminAuthResult {
  authorized: boolean;
  error?: string;
  status?: number;
}

/** Failed organizer-secret attempts allowed per IP per 10 minutes before answering 429. */
const FAILED_ATTEMPTS_LIMIT = 20;

/**
 * Validates the 'x-admin-secret' header against the campaign's adminSecretHash.
 *
 * - The secret is compared in constant time against SHA-256(secret + pepper).
 * - Failed attempts are counted per IP; past the limit the answer becomes 429 (secrets are
 *   256-bit, so this is about noise and log hygiene more than guessing).
 * - The sandbox campaign uses a public, documented secret and a fixed pepper, so it works on any
 *   deployment without weakening real campaigns. It does not exist when the sandbox is off.
 * Mutating organizer routes must call this.
 */
export async function verifyCampaignAdmin(req: NextRequest, campaignId: string): Promise<AdminAuthResult> {
  const adminSecret = req.headers.get("x-admin-secret")?.trim();

  if (!adminSecret) {
    return { authorized: false, error: "Organizer secret required.", status: 401 };
  }

  const isDemoCampaignId = campaignId === DEMO_CAMPAIGN_ID;
  if (isDemoCampaignId && !isSandboxEnabled()) {
    return { authorized: false, error: "Campaign not found.", status: 404 };
  }

  const campaign = await (await getRepo()).getCampaign(campaignId);
  if (!campaign) {
    return { authorized: false, error: "Campaign not found.", status: 404 };
  }

  let ok: boolean;
  if (campaign.isDemo || isDemoCampaignId) {
    const targetHash = campaign.adminSecretHash || DEMO_ADMIN_SECRET_HASH;
    const candidateHash = crypto.createHash("sha256").update(`${adminSecret}:${DEMO_PEPPER}`).digest("hex");
    ok =
      candidateHash.length === targetHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(targetHash, "hex"));
  } else {
    ok = Boolean(campaign.adminSecretHash) && verifyAdminSecret(adminSecret, campaign.adminSecretHash as string);
  }

  if (ok) return { authorized: true };

  const rl = await checkRateLimit(`admin-fail:${clientIp(req)}`, FAILED_ATTEMPTS_LIMIT, 10 * 60_000);
  if (!rl.allowed) {
    return { authorized: false, error: "Too many wrong organizer secrets. Wait a few minutes and try again.", status: 429 };
  }
  return { authorized: false, error: "Wrong organizer secret for this campaign.", status: 403 };
}
