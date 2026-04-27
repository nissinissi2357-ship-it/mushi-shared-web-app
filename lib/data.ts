import { hashPasscode } from "@/lib/auth";
import { buildSummaries, fallbackLogs, fallbackMembers, fallbackPointEntries } from "@/lib/mock-data";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  InquiryObservation,
  LoginResult,
  Member,
  MemberRole,
  ObservationExportLog,
  ObservationInsertInput,
  ObservationLog,
  ObservationUpdateInput,
  PointEntry,
  PointEntryInput
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

type ClubMemberRow = {
  id: string;
  display_name: string;
  role: MemberRole;
  passcode_hash?: string | null;
};

type ObservationRow = {
  id: string;
  member_id: string;
  observed_at: string;
  location: string;
  location_detail?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  species: string;
  points: number;
  scoring_memo: string;
  image_path?: string | null;
  guide_pdf_path?: string | null;
};

type PointEntryRow = {
  id: string;
  member_id: string;
  awarded_at: string;
  title: string;
  description: string;
  points: number;
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

  return (data ?? []).map((row) => mapMemberRow(row as ClubMemberRow));
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

export async function listInquiryObservations(): Promise<InquiryObservation[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("observation_logs")
      .select("id, observed_at, location, location_detail, species")
      .order("observed_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      observedAt: String(row.observed_at),
      location: String(row.location),
      species: String(row.species)
    }));
  } catch {
    return fallbackLogs
      .map((log) => ({
        id: log.id,
        observedAt: log.observedAt,
        location: log.location,
        locationDetail: log.locationDetail,
        species: log.species
      }))
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
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

    return buildViewer(mapMemberRow(data as ClubMemberRow));
  } catch (error) {
    const fallbackMember = fallbackMembers.find((member) => member.displayName === normalizedName);
    if (!fallbackMember || normalizedPasscode !== "1234") {
      throw error instanceof Error ? error : new Error("ログインに失敗しました。");
    }

    const fallbackLogsForViewer =
      fallbackMember.role === "captain" || fallbackMember.role === "admin"
        ? fallbackLogs
        : fallbackLogs.filter((log) => log.memberId === fallbackMember.id);
    const fallbackPointsForViewer =
      fallbackMember.role === "captain" || fallbackMember.role === "admin"
        ? fallbackPointEntries
        : fallbackPointEntries.filter((entry) => entry.memberId === fallbackMember.id);

    return {
      member: fallbackMember,
      logs: fallbackLogsForViewer,
      pointEntries: fallbackPointsForViewer,
      summaries:
        fallbackMember.role === "captain" || fallbackMember.role === "admin"
          ? buildSummaries(fallbackMembers, fallbackLogs, fallbackPointEntries)
          : buildSummaries([fallbackMember], fallbackLogsForViewer, fallbackPointsForViewer)
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
      throw new Error("その隊員名はすでに使われています。");
    }

    throw error;
  }

  return mapMemberRow(data as ClubMemberRow);
}

export async function updateOwnAccount(
  memberId: string,
  input: { displayName?: string; passcode?: string }
): Promise<Member> {
  const updates: { display_name?: string; passcode_hash?: string } = {};
  const nextDisplayName = input.displayName?.trim() || "";
  const nextPasscode = input.passcode?.trim() || "";

  if (!nextDisplayName && !nextPasscode) {
    throw new Error("変更する項目を入力してください。");
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

  return mapMemberRow(data as ClubMemberRow);
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

  return mapMemberRow(data as ClubMemberRow);
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
      throw new Error("最後のAdminは削除できません。");
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
        location_detail: input.locationDetail ?? "",
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        species: input.species,
        points: input.points,
        scoring_memo: input.scoringMemo
      })
    .select("id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path")
    .single();

  if (error) {
    throw error;
  }

  return mapLogRow(data as ObservationRow);
}

export async function updateObservation(
  observationId: string,
  input: ObservationUpdateInput,
  actor: Member
): Promise<ObservationLog> {
  const current = await getObservationById(observationId);
  if (!current) {
    throw new Error("観察ログが見つかりません。");
  }

  ensureOwnOrPrivileged(actor, current.member_id);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("observation_logs")
    .update({
      observed_at: input.observedAt,
      location: input.location,
      location_detail: input.locationDetail ?? "",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      species: input.species,
      points: input.points,
      scoring_memo: input.scoringMemo
    })
    .eq("id", observationId)
    .select("id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path")
    .single();

  if (error) {
    throw error;
  }

  return mapLogRow(data as ObservationRow);
}

export async function deleteObservation(observationId: string, actor: Member): Promise<void> {
  const current = await getObservationById(observationId);
  if (!current) {
    throw new Error("観察ログが見つかりません。");
  }

  ensureOwnOrPrivileged(actor, current.member_id);

  const supabase = createAdminClient();
  const { error } = await supabase.from("observation_logs").delete().eq("id", observationId);

  if (error) {
    throw error;
  }
}

export async function insertPointEntry(input: PointEntryInput, actor: Member): Promise<PointEntry> {
  ensureOwnOrPrivileged(actor, input.memberId);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("point_entries")
    .insert({
      member_id: input.memberId,
      awarded_at: input.awardedAt,
      title: input.title,
      description: input.description,
      points: input.points
    })
    .select("id, member_id, awarded_at, title, description, points")
    .single();

  if (error) {
    throw error;
  }

  return mapPointEntryRow(data as PointEntryRow);
}

export async function updatePointEntry(entryId: string, input: PointEntryInput, actor: Member): Promise<PointEntry> {
  const current = await getPointEntryById(entryId);
  if (!current) {
    throw new Error("追加ポイントが見つかりません。");
  }

  ensureOwnOrPrivileged(actor, current.member_id);
  ensureOwnOrPrivileged(actor, input.memberId);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("point_entries")
    .update({
      member_id: input.memberId,
      awarded_at: input.awardedAt,
      title: input.title,
      description: input.description,
      points: input.points
    })
    .eq("id", entryId)
    .select("id, member_id, awarded_at, title, description, points")
    .single();

  if (error) {
    throw error;
  }

  return mapPointEntryRow(data as PointEntryRow);
}

export async function deletePointEntry(entryId: string, actor: Member): Promise<void> {
  const current = await getPointEntryById(entryId);
  if (!current) {
    throw new Error("追加ポイントが見つかりません。");
  }

  ensureOwnOrPrivileged(actor, current.member_id);

  const supabase = createAdminClient();
  const { error } = await supabase.from("point_entries").delete().eq("id", entryId);

  if (error) {
    throw error;
  }
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
      "id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path, club_members!inner(display_name)"
    )
    .order("observed_at", { ascending: false });

  if (effectiveMemberId) {
    query = query.eq("member_id", effectiveMemberId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapExportLogRow(row as ObservationRow & { club_members?: { display_name?: string | null }[] | { display_name?: string | null } | null }));
}

async function buildViewer(member: Member): Promise<LoginResult> {
  const [logs, pointEntries, summaries] = await Promise.all([
    getLogsForMember(member.id, member.role),
    getPointEntriesForMember(member.id, member.role),
    member.role === "captain" || member.role === "admin"
      ? getAllSummaries()
      : Promise.resolve([] as Awaited<ReturnType<typeof getAllSummaries>>)
  ]);

  return {
    member,
    logs,
    pointEntries,
    summaries:
      member.role === "captain" || member.role === "admin"
        ? summaries
        : buildSummaries([member], logs, pointEntries)
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

  return data ? mapMemberRow(data as ClubMemberRow) : null;
}

async function getLogsForMember(memberId: string, role: MemberRole): Promise<ObservationLog[]> {
  const supabase = createAdminClient();
  const query =
    role === "captain" || role === "admin"
      ? supabase
          .from("observation_logs")
          .select("id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path")
          .order("observed_at", { ascending: false })
      : supabase
          .from("observation_logs")
          .select("id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path")
          .eq("member_id", memberId)
          .order("observed_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapLogRow(row as ObservationRow));
}

async function getPointEntriesForMember(memberId: string, role: MemberRole): Promise<PointEntry[]> {
  const supabase = createAdminClient();
  const query =
    role === "captain" || role === "admin"
      ? supabase
          .from("point_entries")
          .select("id, member_id, awarded_at, title, description, points")
          .order("awarded_at", { ascending: false })
      : supabase
          .from("point_entries")
          .select("id, member_id, awarded_at, title, description, points")
          .eq("member_id", memberId)
          .order("awarded_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapPointEntryRow(row as PointEntryRow));
}

async function getAllSummaries() {
  const supabase = createAdminClient();
  const [
    { data: memberRows, error: memberError },
    { data: logRows, error: logError },
    { data: pointRows, error: pointError }
  ] = await Promise.all([
    supabase.from("club_members").select("id, display_name, role").order("created_at", { ascending: true }),
    supabase
      .from("observation_logs")
      .select("id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path")
      .order("observed_at", { ascending: false }),
    supabase
      .from("point_entries")
      .select("id, member_id, awarded_at, title, description, points")
      .order("awarded_at", { ascending: false })
  ]);

  if (memberError || logError || pointError) {
    throw memberError || logError || pointError;
  }

  return buildSummaries(
    (memberRows ?? []).map((row) => mapMemberRow(row as ClubMemberRow)),
    (logRows ?? []).map((row) => mapLogRow(row as ObservationRow)),
    (pointRows ?? []).map((row) => mapPointEntryRow(row as PointEntryRow))
  );
}

async function getObservationById(observationId: string): Promise<ObservationRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("observation_logs")
    .select("id, member_id, observed_at, location, location_detail, latitude, longitude, species, points, scoring_memo, image_path, guide_pdf_path")
    .eq("id", observationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ObservationRow | null) ?? null;
}

async function getPointEntryById(entryId: string): Promise<PointEntryRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("point_entries")
    .select("id, member_id, awarded_at, title, description, points")
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PointEntryRow | null) ?? null;
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

function ensureOwnOrPrivileged(actor: Member, ownerMemberId: string) {
  const canManageAll = actor.role === "captain" || actor.role === "admin";
  if (!canManageAll && actor.id !== ownerMemberId) {
    throw new Error("自分以外のデータは操作できません。");
  }
}

function mapMemberRow(row: ClubMemberRow): Member {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role
  };
}

function mapLogRow(row: ObservationRow): ObservationLog {
  return {
    id: row.id,
    memberId: row.member_id,
    observedAt: row.observed_at,
    location: row.location,
    locationDetail: row.location_detail ?? "",
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    species: row.species,
    points: row.points,
    scoringMemo: row.scoring_memo,
    imageUrl: row.image_path,
    guidePdfUrl: row.guide_pdf_path
  };
}

function mapPointEntryRow(row: PointEntryRow): PointEntry {
  return {
    id: row.id,
    memberId: row.member_id,
    awardedAt: row.awarded_at,
    title: row.title,
    description: row.description,
    points: row.points
  };
}

function mapExportLogRow(
  row: ObservationRow & {
    club_members?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
  }
): ObservationExportLog {
  const memberRow = Array.isArray(row.club_members) ? row.club_members[0] : row.club_members;

  return {
    ...mapLogRow(row),
    memberDisplayName: memberRow?.display_name || "不明"
  };
}
