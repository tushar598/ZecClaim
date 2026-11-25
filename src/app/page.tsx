import React from "react";
import { HeroPanel, HowItWorks, SandboxCard, TrustModel } from "@/components/home/Overview";
import { AddressChecker } from "@/components/home/AddressChecker";
import { MyCampaignsStrip } from "@/components/home/MyCampaigns";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

export default function HomePage() {
  return (
    <div className="animate-fade-up space-y-10">
      <HeroPanel />
      <MyCampaignsStrip />
      <HowItWorks />
      <AddressChecker />
      {isSandboxEnabled() && <SandboxCard />}
      <TrustModel />
    </div>
  );
}
