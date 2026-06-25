import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next") ?? "/pending";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/pending";
  const supabase = await createClient();

  let errorMessage: string | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && rawType && allowedOtpTypes.has(rawType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: rawType as EmailOtpType });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "인증 정보가 없습니다.";
  }

  if (errorMessage) {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", "email_confirmation_failed");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
