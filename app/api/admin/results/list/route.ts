import { fail, ok, requireApiAdmin } from "@/lib/api";
import { getAdminResults } from "@/lib/data";

export async function GET(request: Request) {
  const guard = await requireApiAdmin("VIEWER");
  if ("error" in guard) return guard.error;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 300), 1), 1000);
  try {
    const results = await getAdminResults(limit);
    return ok({ results, count: Array.isArray(results) ? results.length : 0 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "결과 목록을 불러오지 못했습니다.", 500, "ADMIN_RESULTS_LIST_FAILED");
  }
}
