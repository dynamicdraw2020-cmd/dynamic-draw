import { adminSetupConfigured, envDiagnostics, supabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type SetupStatusCode =
  | "READY"
  | "LOCKED"
  | "SUPABASE_ENV_MISSING"
  | "SUPABASE_URL_INVALID"
  | "SECRET_KEY_MISSING"
  | "SETUP_SECRET_MISSING"
  | "DATABASE_SCHEMA_MISSING"
  | "DATABASE_PERMISSION_MISSING"
  | "PGCRYPTO_SEARCH_PATH_MISSING"
  | "SECRET_KEY_INVALID"
  | "DATABASE_UNREACHABLE"
  | "DATABASE_CHECK_FAILED";

export interface SetupStatus {
  code: SetupStatusCode;
  ready: boolean;
  locked: boolean;
  message: string;
  technicalCode?: string;
  schemaVersion?: string;
}

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
};

function normalizeError(error: unknown): SupabaseLikeError {
  if (error && typeof error === "object") return error as SupabaseLikeError;
  return { message: error instanceof Error ? error.message : String(error ?? "unknown") };
}

function mapDatabaseError(input: unknown): SetupStatus {
  const error = normalizeError(input);
  const code = String(error.code ?? error.status ?? "UNKNOWN");
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  if (
    text.includes("function digest")
    || text.includes("gen_random_bytes")
    || (text.includes("pgcrypto") && text.includes("does not exist"))
  ) {
    return {
      code: "PGCRYPTO_SEARCH_PATH_MISSING",
      ready: false,
      locked: false,
      technicalCode: code,
      message: "DB 암호화 함수 연결이 오래된 버전입니다. 4_DB_보정_v1.0.3.sql을 Supabase SQL Editor에서 한 번 실행해 주세요.",
    };
  }

  if (code === "42501" || text.includes("permission denied") || text.includes("insufficient privilege")) {
    return {
      code: "DATABASE_PERMISSION_MISSING",
      ready: false,
      locked: false,
      technicalCode: code,
      message: "DB 표는 만들어졌지만 서버용 service_role 권한이 빠져 있습니다. 4_DB_보정_v1.0.3.sql을 Supabase SQL Editor에서 한 번 실행해 주세요.",
    };
  }

  if (["42P01", "PGRST205", "PGRST204"].includes(code) || text.includes("relation") && text.includes("does not exist") || text.includes("could not find the table")) {
    return {
      code: "DATABASE_SCHEMA_MISSING",
      ready: false,
      locked: false,
      technicalCode: code,
      message: "𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 DB 표를 찾지 못했습니다. 1_SUPABASE에_한번만_붙여넣기.sql을 Supabase SQL Editor에서 실행해 주세요.",
    };
  }

  if (code === "401" || text.includes("invalid api key") || text.includes("invalid jwt") || text.includes("jwt malformed") || text.includes("unauthorized")) {
    return {
      code: "SECRET_KEY_INVALID",
      ready: false,
      locked: false,
      technicalCode: code,
      message: "Vercel의 SUPABASE_SECRET_KEY 값이 올바르지 않습니다. Supabase의 Secret key를 다시 복사한 뒤 Vercel에서 저장하고 Redeploy해 주세요.",
    };
  }

  if (text.includes("fetch failed") || text.includes("enotfound") || text.includes("network") || text.includes("failed to fetch")) {
    return {
      code: "DATABASE_UNREACHABLE",
      ready: false,
      locked: false,
      technicalCode: code,
      message: "Supabase에 연결하지 못했습니다. NEXT_PUBLIC_SUPABASE_URL이 https://프로젝트주소.supabase.co 형태인지 확인해 주세요.",
    };
  }

  return {
    code: "DATABASE_CHECK_FAILED",
    ready: false,
    locked: false,
    technicalCode: code,
    message: `DB 준비 상태를 확인하지 못했습니다${code !== "UNKNOWN" ? ` (오류 코드 ${code})` : ""}. 4_DB_보정_v1.0.3.sql을 먼저 실행한 뒤 다시 확인해 주세요.`,
  };
}

export async function inspectSetupStatus(): Promise<SetupStatus> {
  if (!envDiagnostics.supabaseUrlPresent || !envDiagnostics.publishableKeyPresent) {
    return {
      code: "SUPABASE_ENV_MISSING",
      ready: false,
      locked: false,
      message: "Supabase 공개 환경변수가 없습니다. Vercel에서 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 확인해 주세요.",
    };
  }

  if (!envDiagnostics.supabaseUrlValid) {
    return {
      code: "SUPABASE_URL_INVALID",
      ready: false,
      locked: false,
      message: "NEXT_PUBLIC_SUPABASE_URL 형식이 잘못되었습니다. 주소 뒤에 /rest/v1을 붙이지 말고 https://프로젝트주소.supabase.co만 넣어 주세요.",
    };
  }

  if (!supabaseAdminConfigured || !envDiagnostics.secretKeyPresent) {
    return {
      code: "SECRET_KEY_MISSING",
      ready: false,
      locked: false,
      message: "서버용 Supabase Secret key가 없습니다. Vercel의 SUPABASE_SECRET_KEY를 확인해 주세요.",
    };
  }

  if (!adminSetupConfigured) {
    return {
      code: "SETUP_SECRET_MISSING",
      ready: false,
      locked: false,
      message: "ADMIN_SETUP_SECRET 환경변수가 없거나 32자보다 짧습니다. 값을 수정한 뒤 Vercel에서 Redeploy해 주세요.",
    };
  }

  try {
    const admin = createAdminClient();

    const statusResult = await admin.rpc("dynamic_draw_install_status");
    if (!statusResult.error && statusResult.data && typeof statusResult.data === "object") {
      const data = statusResult.data as Record<string, unknown>;
      const superAdminCount = Number(data.superAdminCount ?? data.super_admin_count ?? 0);
      const ready = data.ready !== false;
      const serviceRoleCanRead = data.serviceRoleCanReadProfiles !== false;
      const pgcryptoReady = data.pgcryptoReady !== false;
      const schemaVersion = typeof data.schemaVersion === "string" ? data.schemaVersion : undefined;

      if (!pgcryptoReady) {
        return {
          code: "PGCRYPTO_SEARCH_PATH_MISSING",
          ready: false,
          locked: false,
          schemaVersion,
          message: "DB 암호화 함수 연결을 확인하지 못했습니다. 4_DB_보정_v1.0.3.sql을 Supabase SQL Editor에서 실행해 주세요.",
        };
      }

      if (!serviceRoleCanRead) {
        return {
          code: "DATABASE_PERMISSION_MISSING",
          ready: false,
          locked: false,
          schemaVersion,
          message: "서버용 DB 권한이 빠져 있습니다. 4_DB_보정_v1.0.3.sql을 Supabase SQL Editor에서 한 번 실행해 주세요.",
        };
      }

      if (!ready) {
        return {
          code: "DATABASE_SCHEMA_MISSING",
          ready: false,
          locked: false,
          schemaVersion,
          message: "필수 DB 표가 모두 설치되지 않았습니다. 1_SUPABASE에_한번만_붙여넣기.sql을 확인해 주세요.",
        };
      }

      if (superAdminCount > 0) {
        return {
          code: "LOCKED",
          ready: false,
          locked: true,
          schemaVersion,
          message: "최초 최고 관리자가 이미 존재합니다. 이 설치 페이지는 잠겼습니다. 로그인 화면을 이용해 주세요.",
        };
      }

      return {
        code: "READY",
        ready: true,
        locked: false,
        schemaVersion,
        message: "DB 연결과 서버 권한 확인이 완료되었습니다.",
      };
    }

    // 이전 SQL을 설치한 프로젝트도 바로 고칠 수 있도록 상태 함수가 없을 때 profiles 조회로 한 번 더 확인합니다.
    const rpcCode = String(statusResult.error?.code ?? "");
    const rpcText = String(statusResult.error?.message ?? "").toLowerCase();
    const functionMissing = ["PGRST202", "42883"].includes(rpcCode) || rpcText.includes("dynamic_draw_install_status");
    if (!functionMissing && statusResult.error) return mapDatabaseError(statusResult.error);

    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "SUPER_ADMIN");

    if (error) return mapDatabaseError(error);
    if ((count ?? 0) > 0) {
      return {
        code: "LOCKED",
        ready: false,
        locked: true,
        message: "최초 최고 관리자가 이미 존재합니다. 이 설치 페이지는 잠겼습니다. 로그인 화면을 이용해 주세요.",
      };
    }

    return {
      code: "READY",
      ready: true,
      locked: false,
      message: "DB 연결과 서버 권한 확인이 완료되었습니다.",
    };
  } catch (error) {
    return mapDatabaseError(error);
  }
}
