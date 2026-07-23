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

// 呉市内の詳細地図(ユーザー作成SVG)の区分。観察記録の「呉市◯◯」の◯◯部分。
const KURE_SUBLOCATIONS = new Set([
  "旧呉市",
  "天応吉浦",
  "焼山",
  "灰ヶ峰",
  "広阿賀",
  "仁方",
  "野呂山",
  "川尻",
  "安浦",
  "郷原",
  "音戸",
  "倉橋",
  "下蒲刈",
  "上蒲刈",
  "豊島",
  "大崎下島"
]);

function resolveKureSublocation(location: string): string | null {
  if (!location.startsWith("呉市")) {
    return null;
  }
  const sublocation = location.slice(2);
  return KURE_SUBLOCATIONS.has(sublocation) ? sublocation : null;
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
};

function toMonthKey(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number(month)}月`;
}

// 地図の期間フィルタ。ランキングと同じ `scope:value` 形式(month:YYYY-MM / year:YYYY)。
function matchesMapPeriod(observedAt: string, period: string): boolean {
  const [scope, rawValue] = period.split(":");
  if (scope === "year") {
    return new Date(observedAt).getFullYear() === Number(rawValue);
  }
  return toMonthKey(observedAt) === rawValue;
}

export type MapPeriodOption = { value: string; label: string };

// 地図の期間プルダウン。ランキングと同じく「今月・過去の各月・通算(今年)」。
export function buildMapPeriodOptions(logs: ObservationLog[], now: Date = new Date()): MapPeriodOption[] {
  const currentMonthKey = toMonthKey(now);
  const monthKeys = new Set<string>([currentMonthKey]);
  for (const log of logs) {
    monthKeys.add(toMonthKey(log.observedAt));
  }

  const monthlyOptions = [...monthKeys]
    .sort((left, right) => right.localeCompare(left))
    .map((monthKey) => ({
      value: `month:${monthKey}`,
      label: monthKey === currentMonthKey ? "今月" : formatMonthKey(monthKey)
    }));

  return [...monthlyOptions, { value: `year:${now.getFullYear()}`, label: `通算（${now.getFullYear()}年）` }];
}

export type AreaCounts = {
  municipalityCounts: Record<string, number>;
  municipalityMax: number;
  kureSublocationCounts: Record<string, number>;
  kureSublocationMax: number;
};

// 地図用の地域別件数。period(未指定なら全期間)と memberId(未指定なら全員)で絞り込む。
export function buildAreaCounts(
  logs: ObservationLog[],
  options: { period?: string; memberId?: string } = {}
): AreaCounts {
  const { period, memberId } = options;
  const municipalityCounts: Record<string, number> = {};
  const kureSublocationCounts: Record<string, number> = {};

  for (const log of logs) {
    if (memberId && log.memberId !== memberId) {
      continue;
    }
    if (period && !matchesMapPeriod(log.observedAt, period)) {
      continue;
    }

    const location = (log.location || "").trim();
    const municipality = resolveMunicipality(location);
    if (municipality) {
      municipalityCounts[municipality] = (municipalityCounts[municipality] ?? 0) + 1;
    }
    const kureSublocation = resolveKureSublocation(location);
    if (kureSublocation) {
      kureSublocationCounts[kureSublocation] = (kureSublocationCounts[kureSublocation] ?? 0) + 1;
    }
  }

  return {
    municipalityCounts,
    municipalityMax: Object.values(municipalityCounts).reduce((max, value) => Math.max(max, value), 0),
    kureSublocationCounts,
    kureSublocationMax: Object.values(kureSublocationCounts).reduce((max, value) => Math.max(max, value), 0)
  };
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

  for (const log of memberLogs) {
    const location = (log.location || "").trim() || "地域未設定";
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);

    const orderName = (log.orderName || "").trim() || "分類未設定";
    orderCounts.set(orderName, (orderCounts.get(orderName) ?? 0) + 1);
  }

  return {
    member,
    totalCount: memberLogs.length,
    monthCount: monthLogs.length,
    lifetimePoints,
    monthPoints,
    topLocations: rankCounts(locationCounts, 5),
    topOrders: rankCounts(orderCounts, 5)
  };
}
