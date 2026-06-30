import type { Metadata } from "next";
import { AdminResultsManager } from "@/components/admin-results-manager";
import { requireAdmin } from "@/lib/auth";
import { getAdminResults } from "@/lib/data";

export const metadata: Metadata = { title: "결과 관리" };
export const dynamic = "force-dynamic";

export default async function AdminResultsPage() {
  const admin = await requireAdmin("VIEWER");
  const results = await getAdminResults(300);
  return <>
    <div className="admin-toolbar compact-admin-toolbar">
      <div>
        <h1>추첨 결과 관리</h1>
      </div>
    </div>
    <AdminResultsManager initialResults={results as never[]} adminRole={admin.role} />
  </>;
}
