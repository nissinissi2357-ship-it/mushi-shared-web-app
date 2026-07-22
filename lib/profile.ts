import type { Member, ObservationLog, PointEntry } from "@/lib/types";

// アプリの地域名 → 広島県地図(N03 行政区域)の市町村名。
// 「呉市◯◯」の各地域は市町村地図では呉市ひとつに集約する(prefixで処理)。
const APP_LOCATION_TO_MUNICIPALITY: Record<string, string> = {
  熊野町: "熊野町",
  尾道市: "尾道市",
  府中町: "府中町",
  江田島: "江田島市",
  大崎上島: "大崎上島町",
  竹原市: "竹原市",
  安芸太田: "安芸太田町",
  北広島: "北広島町",
  安芸高田: "安芸高田市",
  大竹市: "大竹市",
  廿日市: "廿日市市",
  広島市: "広島市",
  呉市: "呉市",
  東広島市: "東広島市",
  三次市: "三次市",
  世羅町: "世羅町",
  庄原市: "庄原市",
  神石高原: "神石高原町",
  府中市: "府中市",
  福山市: "福山市",
  三原市: "三原市",
  坂町: "坂町"
};

function resolveMunicipality(location: string): string | null {
  if (location.startsWith("呉市")) {
    return "呉市";
  }
  return APP_LOCATION_TO_MUNICIPALITY[location] ?? null;
}

export type ProfileCount = { label: string; count: number };

export type MemberProfile = {
  member: Member;
  totalCount: number;
  monthCount: number;
  lifetimePoints: number;
  monthPoints: number;
  topLocations: ProfileCount[];
  topOrders: ProfileCount[];
  municipalityCounts: Record<string, number>;
  municipalityMax: number;
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
  const municipalityCounts: Record<string, number> = {};

  for (const log of memberLogs) {
    const location = (log.location || "").trim() || "地域未設定";
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);

    const orderName = (log.orderName || "").trim() || "分類未設定";
    orderCounts.set(orderName, (orderCounts.get(orderName) ?? 0) + 1);

    const municipality = resolveMunicipality(location);
    if (municipality) {
      municipalityCounts[municipality] = (municipalityCounts[municipality] ?? 0) + 1;
    }
  }

  const municipalityMax = Object.values(municipalityCounts).reduce((max, value) => Math.max(max, value), 0);

  return {
    member,
    totalCount: memberLogs.length,
    monthCount: monthLogs.length,
    lifetimePoints,
    monthPoints,
    topLocations: rankCounts(locationCounts, 5),
    topOrders: rankCounts(orderCounts, 5),
    municipalityCounts,
    municipalityMax
  };
}
