import { NextResponse } from "next/server";

const message = "전체 회원 추첨 API가 /api/admin/raffles 로 변경되었습니다.";

export async function GET() {
  return NextResponse.json({ error: message, redirectTo: "/admin/raffles" }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: message, redirectTo: "/admin/raffles" }, { status: 410 });
}
