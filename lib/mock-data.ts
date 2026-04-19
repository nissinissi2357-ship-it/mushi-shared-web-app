import type { Member, MemberSummary, ObservationLog } from "@/lib/types";

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
    species: "セボシジョウカイ",
    points: 1,
    scoringMemo: "焼山🟪…1P",
    imageUrl: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "log-002",
    memberId: "member-001",
    observedAt: "2026-04-19T17:01:00+09:00",
    location: "呉市旧呉市",
    species: "クワキヨコバイ",
    points: 8,
    scoringMemo: "呉市1年ぶり、旧呉市初、呉市🟪、広島県🟪…8P"
  },
  {
    id: "log-003",
    memberId: "member-002",
    observedAt: "2026-04-18T11:10:00+09:00",
    location: "東広島",
    species: "アオスジアゲハ",
    points: 2,
    scoringMemo: "東広島🟪…2P",
    imageUrl: "https://images.unsplash.com/photo-1444464666168-49d633b86797?auto=format&fit=crop&w=900&q=80"
  }
];

export function buildSummaries(allMembers: Member[], allLogs: ObservationLog[]): MemberSummary[] {
  return allMembers
    .map((member) => {
      const memberLogs = allLogs.filter((log) => log.memberId === member.id);
      const sortedLogs = [...memberLogs].sort((left, right) => right.observedAt.localeCompare(left.observedAt));

      return {
        memberId: member.id,
        displayName: member.displayName,
        role: member.role,
        totalPoints: memberLogs.reduce((sum, log) => sum + log.points, 0),
        recordCount: memberLogs.length,
        latestObservedAt: sortedLogs[0]?.observedAt ?? null
      };
    })
    .sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) {
        return right.totalPoints - left.totalPoints;
      }

      return right.recordCount - left.recordCount;
    });
}
