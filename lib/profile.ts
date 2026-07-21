import type { Member, ObservationLog, PointEntry } from "@/lib/types";

// 呉市内の地域（コロプレス地図で塗り分ける単位）。lib/locations.ts の
// KURE_SUBLOCATIONS を「呉市◯◯」の正規化名にしたもの。地図の描画順にもなる。
export const KURE_REGION_ORDER = [
  "呉市旧呉市",
  "呉市天応吉浦",
  "呉市焼山",
  "呉市灰ヶ峰",
  "呉市郷原",
  "呉市広阿賀",
  "呉市野呂山",
  "呉市仁方",
  "呉市川尻",
  "呉市安浦",
  "呉市音戸",
  "呉市倉橋",
  "呉市下蒲刈",
  "呉市上蒲刈",
  "呉市豊島",
  "呉市大崎下島"
] as const;

const KURE_REGION_SET = new Set<string>(KURE_REGION_ORDER);

export type ProfileCount = { label: string; count: number };

export type MemberProfile = {
  member: Member;
  totalCount: number;
  monthCount: number;
  lifetimePoints: number;
  monthPoints: number;
  topLocations: ProfileCount[];
  topOrders: ProfileCount[];
  kureRegionCounts: Record<string, number>;
  kureRegionMax: number;
  kureTotal: number;
  nonKureCounts: ProfileCount[];
};

function toMonthKey(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function rankCounts(counts: Map<string, number>, limit?: number): ProfileCount[] {
  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.label.localeCompare(right.label, "ja-JP");
    });

  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

export function buildMemberProfile(
  member: Member,
  logs: ObservationLog[],
  pointEntries: PointEntry[],
  now: Date = new Date()
): MemberProfile {
  const currentMonthKey = toMonthKey(now);

  const memberLogs = logs.filter((log) => log.memberId === member.id);
  const memberPointEntries = pointEntries.filter((entry) => entry.memberId === member.id);

  const monthLogs = memberLogs.filter((log) => toMonthKey(log.observedAt) === currentMonthKey);
  const monthPointEntries = memberPointEntries.filter(
    (entry) => toMonthKey(entry.awardedAt) === currentMonthKey
  );

  const lifetimePoints =
    memberLogs.reduce((sum, log) => sum + log.points, 0) +
    memberPointEntries.reduce((sum, entry) => sum + entry.points, 0);
  const monthPoints =
    monthLogs.reduce((sum, log) => sum + log.points, 0) +
    monthPointEntries.reduce((sum, entry) => sum + entry.points, 0);

  const locationCounts = new Map<string, number>();
  const orderCounts = new Map<string, number>();
  const kureRegionCounts: Record<string, number> = Object.fromEntries(
    KURE_REGION_ORDER.map((name) => [name, 0])
  );
  const nonKureCounts = new Map<string, number>();

  for (const log of memberLogs) {
    const location = (log.location || "").trim() || "地域未設定";
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);

    const orderName = (log.orderName || "").trim() || "分類未設定";
    orderCounts.set(orderName, (orderCounts.get(orderName) ?? 0) + 1);

    if (KURE_REGION_SET.has(location)) {
      kureRegionCounts[location] += 1;
    } else if (location !== "地域未設定") {
      nonKureCounts.set(location, (nonKureCounts.get(location) ?? 0) + 1);
    }
  }

  const kureCountValues = Object.values(kureRegionCounts);
  const kureRegionMax = kureCountValues.reduce((max, value) => Math.max(max, value), 0);
  const kureTotal = kureCountValues.reduce((sum, value) => sum + value, 0);

  return {
    member,
    totalCount: memberLogs.length,
    monthCount: monthLogs.length,
    lifetimePoints,
    monthPoints,
    topLocations: rankCounts(locationCounts, 5),
    topOrders: rankCounts(orderCounts, 5),
    kureRegionCounts,
    kureRegionMax,
    kureTotal,
    nonKureCounts: rankCounts(nonKureCounts)
  };
}
