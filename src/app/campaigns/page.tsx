import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/misc";
import { MyCampaignsList } from "@/components/home/MyCampaigns";

export const metadata: Metadata = { title: "My campaigns", robots: { index: false } };

export default function CampaignsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeading
        eyebrow="Workspace"
        title="My campaigns"
        description="Campaigns created or opened in this browser. Organizer secrets stay on this device; the server only stores hashes."
      />
      <MyCampaignsList />
    </div>
  );
}
