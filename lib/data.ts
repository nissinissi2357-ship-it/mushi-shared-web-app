import { hashPasscode } from "@/lib/auth";
import { buildSummaries, fallbackLogs, fallbackMembers } from "@/lib/mock-data";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  LoginResult,
  Member,
  MemberRole,
  ObservationExportLog,
  ObservationInsertInput,
  ObservationLog
} from "@/lib/types";

type DataResult = {
  members: Member[];
  source: "supabase" | "fallback";
  warning: string | null;
};

type SessionMember = {
  memberId: string;
  role: MemberRole;
};

export async function getAppData(): Promise<DataResult> {
  try {
    const members = await listMembers();

    return {
      members,
      source: "supabase",
      warning: members.length === 0 ? "まだ隊員が登録されていません。" : null
    };
  } catch (error) {
    return {
      members: fallbackMembers,
      source: "fallback",
      warning:
        error instanceof Error
          ? `Supabase に接続できなかったため、サンプル表示に切り替えています: ${error.message}`
          : "Supabase に接続できなかったため、サンプル表示に切り替えています。"
    };
  }
}

export async function listMembers(): Promise<Member[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("club_members")
    .select("id, display_name, role")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMemberRow);
}

export async function getViewerFromSession(session: SessionMember | null): Promise<LoginResult | null> {
  if (!session) {
    return null;
  }

  try {
    const member = await getMemberById(session.memberId);
    if (!member || member.role !== session.role) {
      return null;
    }

    return buildViewer(member);
  } catch {
    return null;
  }
}

export async function loginMember(displayName: string, passcode: string): Promise<LoginResult> {
  const normalizedName = displayName.trim();
  const normalizedPasscode = passcode.trim();

  if (!normalizedName || !normalizedPasscode) {
    throw new Error("隊員名と合言葉を入力してください。");
  }

  try {
    const supabase = createAdminClient();
    const hashedPasscode = hashPasscode(normalizedPasscode);

    const { data, error } = await supabase
      .from("club_members")
      .select("id, display_name, role, passcode_hash")
      .eq("display_name", normalizedName)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("その隊員名は見つかりませんでした。");
    }

    if (!data.passcode_hash || data.passcode_hash !== hashedPasscode) {
      throw new Error("合言葉が違います。");
    }

    return buildViewer(mapMemberRow(data));
  } catch (error) {
    const fallbackMember = fallbackMembers.find((member) => member.displayName === normalizedName);
    if (!fallbackMember || normalizedPasscode !== "1234") {
      throw error instanceof Error ? error : new Error("ログインに失敗しました。");
    }

    return {
      member: fallbackMember,
      logs:
        fallbackMember.role === "captain" || fallbackMember.role === "admin"
          ? fallbackLogs
          : fallbackLogs.filter((log) => log.memberId === fallbackMember.id),
      summaries:
        fallbackMember.role === "captain" || fallbackMember.role === "admin"
          ? buildSummaries(fallbackMembers, fallbackLogs)
          : buildSummaries([fallbackMember], fallbackLogs.filter((log) => log.memberId === fallbackMember.id))
    };
  }
}

export async function createMember(
  displayName: string,
  passcode: string,
  role: MemberRole = "member"
): Promise<Member> {
  const normalizedName = displayName.trim();
  const normalizedPasscode = passcode.trim();

  if (!normalizedName || !normalizedPasscode) {
    throw new Error("隊員名と合言葉を入力してください。");
  }

  if (normalizedPasscode.length < 4) {
    throw new Error("合言葉は4文字以上にしてください。");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("club_members")
    .insert({
      display_name: normalizedName,
      role,
      passcode_hash: hashPasscode(normalizedPasscode)
    })
    .select("id, display_name, role")
    .single();

  if (error) {
    if ("code" in error && error.code === "23505") {
      throw new Error("同じ隊員名がすでに登録されています。");
    }

    throw error;
  }

  return mapMemberRow(data);
}

export async function updateOwnAccount(
  memberId: string,
  input: { displayName?: string; passcode?: string }
): Promise<Member> {
  const updates: { display_name?: string; passcode_hash?: string } = {};
  const nextDisplayName = input.displayName?.trim() || "";
  const nextPasscode = input.passcode?.trim() || "";

  if (!nextDisplayName && !nextPasscode) {
    throw new Error("変更したい項目を入力してください。");
  }

  if (nextDisplayName) {
    updates.display_name = nextDisplayName;
  }

  if (nextPasscode) {
    if (nextPasscode.length < 4) {
      throw new Error("合言葉は4文字以上にしてください。");
    }

    updates.passcode_hash = hashPasscode(nextPasscode);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("club_members")
    .update(updates)
    .eq("id", memberId)
    .select("id, display_name, role")
    .single();

  if (error) {
    if ("code" in error && error.code === "23505") {
      throw new Error("その隊員名はすでに使われています。");
    }

    throw error;
  }

  return mapMemberRow(data);
}

export async function adminUpdateMemberRole(
  actorMemberId: string,
  targetMemberId: string,
  role: MemberRole
): Promise<Member> {
  if (actorMemberId === targetMemberId) {
    throw new Error("自分自身の権限変更はできません。");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("club_members")
    .update({ role })
    .eq("id", targetMemberId)
    .select("id, display_name, role")
    .single();

  if (error) {
    throw error;
  }

  return mapMemberRow(data);
}

export async function adminResetMemberPasscode(targetMemberId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("club_members")
    .update({ passcode_hash: hashPasscode("0000") })
    .eq("id", targetMemberId);

  if (error) {
    throw error;
  }
}

export async function adminDeleteMember(actorMemberId: string, targetMemberId: string): Promise<void> {
  if (actorMemberId === targetMemberId) {
    throw new Error("自分自身は削除できません。");
  }

  const target = await getMemberById(targetMemberId);
  if (!target) {
    throw new Error("削除対象の隊員が見つかりません。");
  }

  if (target.role === "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new Error("最後の Admin は削除できません。");
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("club_members").delete().eq("id", targetMemberId);
  if (error) {
    throw error;
  }
}

export async function insertObservation(input: ObservationInsertInput, member: Member): Promise<ObservationLog> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("observation_logs")
    .insert({
      member_id: member.id,
      observed_at: input.observedAt,
      location: input.location,
      species: input.species,
      points: input.points,
      scoring_memo: input.scoringMemo
    })
    .select("id, member_id, observed_at, location, species, points, scoring_memo, image_path, guide_pdf_path")
    .single();

  if (error) {
    throw error;
  }

  return mapLogRow(data);
}

export async function listExportLogs(
  member: Member,
  filterMemberId?: string | null
): Promise<ObservationExportLog[]> {
  const supabase = createAdminClient();
  const effectiveMemberId =
    member.role === "captain" || member.role === "admin" ? filterMemberId ?? null : member.id;

  let query = supabase
    .from("observation_logs")
    .select(
      "id, member_id, observed_at, location, species, points, scoring_memo, image_path, guide_pdf_path, club_members!inner(display_name)"
    )
    .order("observed_at", { ascending: false });

  if (effectiveMemberId) {
    query = query.eq("member_id", effectiveMemberId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapExportLogRow(row));
}

async function buildViewer(member: Member): Promise<LoginResult> {
  const logs = await getLogsForMember(member.id, member.role);
  const summaries =
    member.role === "captain" || member.role === "admin"
      ? await getAllSummaries()
      : buildSummaries([member], logs);

  return {
    member,
    logs,
    summaries
  };
}

async function getMemberById(memberId: string): Promise<Member | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("club_members")
    .select("id, display_name, role")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapMemberRow(data) : null;
}

async function getLogsForMember(memberId: string, role: MemberRole): Promise<ObservationLog[]> {
  const supabase = createAdminClient();
  const query =
    role === "captain" || role === "admin"
      ? supabase
          .from("observation_logs")
          .select("id, member_id, observed_at, location, species, points, scoring_memo, image_path, guide_pdf_path")
          .order("observed_at", { ascending: false })
      : supabase
          .from("observation_logs")
          .select("id, member_id, observed_at, location, species, points, scoring_memo, image_path, guide_pdf_path")
          .eq("member_id", memberId)
          .order("observed_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []).map(mapLogRow);
}

async function getAllSummaries() {
  const supabase = createAdminClient();
  const [{ data: memberRows, error: memberError }, { data: logRows, error: logError }] = await Promise.all([
    supabase.from("club_members").select("id, display_name, role").order("created_at", { ascending: true }),
    supabase
      .from("observation_logs")
      .select("id, member_id, observed_at, location, species, points, scoring_memo, image_path, guide_pdf_path")
      .order("observed_at", { ascending: false })
  ]);

  if (memberError || logError) {
    throw memberError || logError;
  }

  return buildSummaries((memberRows ?? []).map(mapMemberRow), (logRows ?? []).map(mapLogRow));
}

async function countAdmins() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("club_members")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function mapMemberRow(row: { id: string; display_name: string; role: MemberRole }): Member {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role
  };
}

function mapLogRow(row: {
  id: string;
  member_id: string;
  observed_at: string;
  location: string;
  species: string;
  points: number;
  scoring_memo: string;
  image_path?: string | null;
  guide_pdf_path?: string | null;
}): ObservationLog {
  return {
    id: row.id,
    memberId: row.member_id,
    observedAt: row.observed_at,
    location: row.location,
    species: row.species,
    points: row.points,
    scoringMemo: row.scoring_memo,
    imageUrl: row.image_path,
    guidePdfUrl: row.guide_pdf_path
  };
}

function mapExportLogRow(row: {
  id: string;
  member_id: string;
  observed_at: string;
  location: string;
  species: string;
  points: number;
  scoring_memo: string;
  image_path?: string | null;
  guide_pdf_path?: string | null;
  club_members?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
}): ObservationExportLog {
  const memberRow = Array.isArray(row.club_members) ? row.club_members[0] : row.club_members;

  return {
    ...mapLogRow(row),
    memberDisplayName: memberRow?.display_name || "不明"
  };
}
