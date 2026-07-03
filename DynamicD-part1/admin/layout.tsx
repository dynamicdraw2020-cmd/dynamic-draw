import { AdminSidebar } from "@/components/admin-sidebar";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin("VIEWER");
  return <div className="admin-shell"><AdminSidebar profile={profile} /><main className="admin-content">{children}</main></div>;
}
