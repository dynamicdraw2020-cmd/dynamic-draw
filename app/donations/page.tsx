import type { Metadata } from "next";
import { DonationPublicPage } from "@/components/donation-public";
import { getDonationSettings } from "@/lib/donations";

export const metadata: Metadata = { title: "후원 안내" };
export const dynamic = "force-dynamic";

export default async function DonationsPage() {
  const settings = await getDonationSettings();
  return <DonationPublicPage settings={settings} />;
}
