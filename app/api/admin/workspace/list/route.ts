import { fail, ok, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const guard = await requireApiAdmin("MANAGER");
  if ("error" in guard) return guard.error;
  try {
    const admin = createAdminClient();
    const [membersResult, notesResult, meetingsResult] = await Promise.all([
      admin.from("profiles").select("id,display_name,username,email,role,status,member_code").order("created_at", { ascending: false }).limit(500),
      admin.from("admin_notes").select("*").order("created_at", { ascending: false }).limit(300),
      admin.from("admin_meetings").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (notesResult.error) return fail(notesResult.error.message, 500, "ADMIN_NOTES_LIST_FAILED");
    if (meetingsResult.error) return fail(meetingsResult.error.message, 500, "ADMIN_MEETINGS_LIST_FAILED");

    const profiles = (membersResult.data ?? []) as Array<Record<string, unknown>>;
    const profileMap = new Map(profiles.map((profile) => [String(profile.id), profile]));

    const notes = ((notesResult.data ?? []) as Array<Record<string, unknown>>).map((note) => ({
      ...note,
      profiles: note.profile_id ? profileMap.get(String(note.profile_id)) ?? null : null,
      creator: note.created_by ? profileMap.get(String(note.created_by)) ?? null : null,
    }));
    const meetings = ((meetingsResult.data ?? []) as Array<Record<string, unknown>>).map((meeting) => ({
      ...meeting,
      creator: meeting.created_by ? profileMap.get(String(meeting.created_by)) ?? null : null,
    }));

    return ok({ members: profiles, notes, meetings, count: { notes: notes.length, meetings: meetings.length } });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "관리자 메모 데이터를 불러오지 못했습니다.", 500, "ADMIN_WORKSPACE_LIST_FAILED");
  }
}
