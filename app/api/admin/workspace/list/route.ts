import { fail, ok, requireApiAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

function mapById(rows: Array<Record<string, unknown>>) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

export async function GET() {
  const guard = await requireApiAdmin("MANAGER");
  if ("error" in guard) return guard.error;

  try {
    const admin = createAdminClient();
    const [membersResult, notesResult, meetingsResult, readsResult] = await Promise.all([
      admin.from("profiles").select("id,display_name,username,email,role,status,member_code").order("created_at", { ascending: false }).limit(1000),
      admin.from("admin_notes").select("*").order("created_at", { ascending: false }).limit(500),
      admin.from("admin_meetings").select("*").order("created_at", { ascending: false }).limit(300),
      admin.from("admin_note_reads").select("note_id,admin_id,read_at").order("read_at", { ascending: false }).limit(5000),
    ]);

    if (notesResult.error) return fail(notesResult.error.message, 500, "ADMIN_NOTES_LIST_FAILED");
    if (meetingsResult.error) return fail(meetingsResult.error.message, 500, "ADMIN_MEETINGS_LIST_FAILED");

    const profiles = (membersResult.data ?? []) as Array<Record<string, unknown>>;
    const profileMap = mapById(profiles);
    const reads = (readsResult.data ?? []) as Array<{ note_id: string; admin_id: string; read_at: string }>;
    const readsByNote = new Map<string, Array<Record<string, unknown>>>();
    for (const read of reads) {
      const adminProfile = profileMap.get(String(read.admin_id));
      const list = readsByNote.get(read.note_id) ?? [];
      list.push({ ...read, admin: adminProfile ?? null });
      readsByNote.set(read.note_id, list);
    }

    const notes = ((notesResult.data ?? []) as Array<Record<string, unknown>>).map((note) => {
      const noteReads = readsByNote.get(String(note.id)) ?? [];
      return {
        ...note,
        profiles: note.profile_id ? profileMap.get(String(note.profile_id)) ?? null : null,
        creator: note.created_by ? profileMap.get(String(note.created_by)) ?? null : null,
        read_count: noteReads.length,
        read_by_me: noteReads.some((row) => String(row.admin_id) === guard.auth.userId),
        read_list: guard.auth.profile.role === "SUPER_ADMIN" ? noteReads : [],
      };
    });

    const meetings = ((meetingsResult.data ?? []) as Array<Record<string, unknown>>).map((meeting) => ({
      ...meeting,
      creator: meeting.created_by ? profileMap.get(String(meeting.created_by)) ?? null : null,
    }));

    return ok({ members: profiles, notes, meetings, count: { notes: notes.length, meetings: meetings.length }, currentAdmin: { id: guard.auth.userId, role: guard.auth.profile.role }, source: "table" });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "관리자 메모 데이터를 불러오지 못했습니다.", 500, "ADMIN_WORKSPACE_LIST_FAILED");
  }
}
