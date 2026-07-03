import type { Metadata } from "next";
import { OperationModeForm } from "@/components/operation-mode-form";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { demoMode } from "@/lib/env";

export const metadata: Metadata = { title: "운영 모드" };
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").replace(/^"|"$/g, "");
}

export default async function AdminOperationModePage() {
  await requireAdmin("SUPER_ADMIN");
  const initial = { operationMode: "ACTIVE", operationMessage: "현재 시스템 업데이트중입니다.", operationEndsAt: "" };
  if (!demoMode) {
    const { data } = await createAdminClient()
      .from("site_settings")
      .select("key,value")
      .in("key", ["operation_mode", "operation_message", "operation_ends_at"]);
    for (const row of data ?? []) {
      if (row.key === "operation_mode") initial.operationMode = clean(row.value) || "ACTIVE";
      if (row.key === "operation_message") initial.operationMessage = clean(row.value);
      if (row.key === "operation_ends_at") initial.operationEndsAt = clean(row.value);
    }
  }

  return <>
    <div className="admin-toolbar compact-admin-toolbar">
      <div>
        <h1>운영 모드</h1>
      </div>
    </div>
    <OperationModeForm initial={initial} />
  </>;
}
