import type { Member, MemberSummary, ObservationLog, PointEntry } from "@/lib/types";

export const fallbackMembers: Member[] = [
  { id: "member-001", displayName: "たろう", role: "member" },
  { id: "member-002", displayName: "はな", role: "member" },
  { id: "captain-001", displayName: "隊長", role: "captain" }
];

export const fallbackLogs: ObservationLog[] = [
  {
    id: "log-001",
    memberId: "member-001",
    observedAt: "2026-04-19T16:57:00+09:00",
    location: "呉市焼山",
    locationDetail: "焼山中央",
    orderName: "コウチュウ",
    familyName: "ジョウカイボン",
    species: "セボシジョウカイ",
    scientificName: "Lycocerus sp.",
    points: 1,
    scoringMemo: "焼山 1P"
  },
  {
    id: "log-002",
    memberId: "member-001",
    observedAt: "2026-04-19T17:01:00+09:00",
    location: "呉市旧呉市",
    locationDetail: "本通",
    orderName: "カメムシ",
    familyName: "ヨコバイ",
    species: "クワキヨコバイ",
    scientificName: "Xestocephalus sp.",
    points: 8,
    scoringMemo: "呉市1年ぶり、旧呉市初、呉市、広島県 8P"
  },
  {
    id: "log-003",
    memberId: "member-002",
    observedAt: "2026-04-18T11:10:00+09:00",
    location: "東広島市",
    locationDetail: "西条町寺家",
    orderName: "チョウ",
    familyName: "アゲハチョウ",
    species: "アオスジアゲハ",
    scientificName: "Graphium sarpedon",
    points: 2,
    scoringMemo: "東広島市 2P"
  }
];

export const fallbackPointEntries: PointEntry[] = [
  {
    id: "point-001",
    memberId: "member-001",
    awardedAt: "2026-04-20T09:00:00+09:00",
    title: "誤同定の指摘",
    description: "同定の修正提案が採用された",
    points: 2
  },
  {
    id: "point-002",
    memberId: "member-002",
    awardedAt: "2026-04-20T10:00:00+09:00",
    title: "図鑑写真の更新",
    description: "図鑑用の写真が新しく採用された",
    points: 3
  }
];

export function buildSummaries(
  allMembers: Member[],
  allLogs: ObservationLog[],
  allPointEntries: PointEntry[]
): MemberSummary[] {
  const summaryYear = new Date().getFullYear();

  return allMembers
    .map((member) => {
      const lifetimeLogs = allLogs.filter((log) => log.memberId === member.id);
      const lifetimePointEntries = allPointEntries.filter((entry) => entry.memberId === member.id);
      const memberLogs = lifetimeLogs.filter((log) => isInYear(log.observedAt, summaryYear));
      const memberPointEntries = allPointEntries.filter(
        (entry) => entry.memberId === member.id && isInYear(entry.awardedAt, summaryYear)
      );
      const sortedLogs = [...memberLogs].sort((left, right) => right.observedAt.localeCompare(left.observedAt));
      const observationPoints = memberLogs.reduce((sum, log) => sum + log.points, 0);
      const extraPoints = memberPointEntries.reduce((sum, entry) => sum + entry.points, 0);
      const lifetimeObservationPoints = lifetimeLogs.reduce((sum, log) => sum + log.points, 0);
      const lifetimeExtraPoints = lifetimePointEntries.reduce((sum, entry) => sum + entry.points, 0);

      return {
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,
        totalPoints: observationPoints + extraPoints,
        lifetimeTotalPoints: lifetimeObservationPoints + lifetimeExtraPoints,
        observationPoints,
        extraPoints,
        recordCount: memberLogs.length,
        pointEntryCount: memberPointEntries.length,
        latestObservedAt: sortedLogs[0]?.observedAt ?? null
      };
    })
    .sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) {
        return right.totalPoints - left.totalPoints;
      }

      if (right.recordCount !== left.recordCount) {
        return right.recordCount - left.recordCount;
      }

      return left.displayName.localeCompare(right.displayName, "ja");
    });
}

function isInYear(value: string, year: number) {
  return new Date(value).getFullYear() === year;
}
