import { NextResponse } from "next/server";
import { demoMode, supabaseAdminConfigured, supabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();

  if (demoMode || !supabaseAdminConfigured) {
    return NextResponse.json({
      ok: true,
      data: {
        status: "preview",
        supabaseConfigured,
        databaseConnected: false,
        checkedAt,
      },
    });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("dynamic_draw_install_status");

    if (error) {
      return NextResponse.json({
        ok: false,
        error: {
          code: "DATABASE_HEALTH_CHECK_FAILED",
          message: "Supabase DB 상태를 확인하지 못했습니다.",
          technicalCode: error.code,
        },
        data: {
          status: "degraded",
          supabaseConfigured: true,
          databaseConnected: false,
          checkedAt,
        },
      }, { status: 503 });
    }

    const install = (data ?? {}) as Record<string, unknown>;
    const pgcryptoReady = install.pgcryptoReady !== false;
    const serviceRoleCanReadProfiles = install.serviceRoleCanReadProfiles !== false;
    const healthy = pgcryptoReady && serviceRoleCanReadProfiles;

    return NextResponse.json({
      ok: healthy,
      data: {
        status: healthy ? "healthy" : "degraded",
        supabaseConfigured: true,
        databaseConnected: true,
        schemaVersion: install.schemaVersion ?? null,
        pgcryptoReady,
        serviceRoleCanReadProfiles,
        checkedAt,
      },
    }, { status: healthy ? 200 : 503 });
  } catch {
    return NextResponse.json({
      ok: false,
      error: {
        code: "DATABASE_HEALTH_CHECK_EXCEPTION",
        message: "DB 상태 확인 중 예외가 발생했습니다.",
      },
      data: {
        status: "degraded",
        supabaseConfigured: true,
        databaseConnected: false,
        checkedAt,
      },
    }, { status: 503 });
  }
}
