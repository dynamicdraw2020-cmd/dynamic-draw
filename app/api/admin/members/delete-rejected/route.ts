import { z } from "zod";
import { databaseRpcErrorMessage, enforceSameOrigin, fail, ok, rejectDemoMutation, requestMeta, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  confirm: z.string().trim().refine((value) => value === "DELETE_REJECTED", "확인 문구가 일치하지 않습니다."),
  reason: z.string().trim().min(2, "삭제 사유를 2자 이상 입력해 주세요.").max(300, "삭제 사유는 300자 이하로 입력해 주세요."),
});

type DeleteRejectedResult = {
  deletedCount?: number;
  deletedAt?: string;
  onlyRejectedRegularUsers?: boolean;
  deleteMode?: string;
};

export async function POST(request: Request) {
  const demo = rejectDemoMutation();
  if (demo) return demo;

  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const guard = await requireApiAdmin("SUPER_ADMIN");
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "요청 값을 확인해 주세요.", 422, "INVALID_REJECTED_DELETE_REQUEST");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("delete_rejected_signup_accounts", {
    p_admin_id: guard.auth.userId,
    p_reason: parsed.data.reason,
    p_confirm_text: "DELETE_REJECTED",
  });

  if (error) {
    return fail(
      databaseRpcErrorMessage(error, "반려 가입 계정 전체 삭제 처리에 실패했습니다."),
      400,
      "REJECTED_SIGNUP_DELETE_FAILED",
      error,
    );
  }

  const result = (data ?? {}) as DeleteRejectedResult;
  const deletedCount = Number(result.deletedCount ?? 0);
  const deletedAt = typeof result.deletedAt === "string" ? result.deletedAt : new Date().toISOString();

  try {
    const meta = requestMeta(request);
    await admin.rpc("append_admin_log", {
      p_admin_id: guard.auth.userId,
      p_action: "REJECTED_SIGNUP_ACCOUNTS_BULK_DELETED",
      p_target_table: "profiles",
      p_target_id: guard.auth.userId,
      p_details: {
        deletedCount,
        reason: parsed.data.reason,
        deletedAt,
        scope: "status=REJECTED, role=USER",
        deleteMode: result.deleteMode ?? "SOFT_DELETE",
      },
      p_ip: meta.ip,
      p_user_agent: meta.userAgent,
    });
  } catch {
    // 감사 로그 RPC가 일시적으로 실패해도 반려 가입 삭제 처리 결과는 유지합니다.
  }

  return ok({
    deletedCount,
    deletedAt,
    onlyRejectedRegularUsers: result.onlyRejectedRegularUsers !== false,
    deleteMode: result.deleteMode ?? "SOFT_DELETE",
  });
}
