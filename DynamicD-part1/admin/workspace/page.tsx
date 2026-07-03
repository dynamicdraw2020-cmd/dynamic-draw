import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminWorkspace } from "@/components/admin-workspace";

export const metadata: Metadata = { title: "관리자 메모·회의록" };
export const dynamic = "force-dynamic";

export default async function AdminWorkspacePage() {
  const currentAdmin = await requireAdmin("MANAGER");
  const admin = createAdminClient();
  const { data: rpcData } = await admin.rpc("get_admin_workspace_data", { p_note_limit: 300, p_meeting_limit: 200 });
  if (rpcData && typeof rpcData === "object") {
    const payload = rpcData as { members?: unknown[]; notes?: unknown[]; meetings?: unknown[] };
    return <main><div className="page-heading"><h1>관리자 메모·회의록</h1></div><AdminWorkspace data={{ members: (payload.members ?? []) as never[], notes: (payload.notes ?? []) as never[], meetings: (payload.meetings ?? []) as never[] }} currentAdmin={{ id: currentAdmin.id, role: currentAdmin.role }} /></main>;
  }

  const [members, notes, meetings] = await Promise.all([
    admin.from("profiles").select("id,display_name,username,email,role,status,member_code").order("created_at", { ascending: false }).limit(500),
    admin.from("admin_notes").select("*").order("created_at", { ascending: false }).limit(300),
    admin.from("admin_meetings").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  const profiles = (members.data ?? []) as Array<Record<string, unknown>>;
  const profileMap = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const mappedNotes = ((notes.data ?? []) as Array<Record<string, unknown>>).map((note) => ({ ...note, profiles: note.profile_id ? profileMap.get(String(note.profile_id)) ?? null : null, creator: note.created_by ? profileMap.get(String(note.created_by)) ?? null : null }));
  const mappedMeetings = ((meetings.data ?? []) as Array<Record<string, unknown>>).map((meeting) => ({ ...meeting, creator: meeting.created_by ? profileMap.get(String(meeting.created_by)) ?? null : null }));
  return <main><div className="page-heading"><h1>관리자 메모·회의록</h1></div><AdminWorkspace data={{ members: profiles, notes: mappedNotes, meetings: mappedMeetings }} currentAdmin={{ id: currentAdmin.id, role: currentAdmin.role }} /></main>;
}
