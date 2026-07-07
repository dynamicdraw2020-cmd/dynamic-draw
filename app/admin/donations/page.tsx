import type { Metadata } from "next";
import { DonationAdminManager } from "@/components/donation-admin-manager";
import { getDonationSettings } from "@/lib/donations";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "후원 설정" };
export const dynamic = "force-dynamic";

export default async function AdminDonationsPage() {
  await requireAdmin("MANAGER");
  const settings = await getDonationSettings();
  return (
    <>
      <div className="admin-toolbar compact-admin-toolbar">
        <div>
          <h1>후원 설정</h1>
          <p className="text-muted">대문 후원 버튼, 후원 안내 문구, 금액별 혜택을 관리합니다.</p>
        </div>
      </div>
      <DonationAdminManager initial={settings} />
    </>
  );
}
