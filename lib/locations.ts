const NON_KURE_LOCATIONS = [
  "熊野町",
  "尾道市",
  "府中町",
  "江田島",
  "大崎上島",
  "竹原市",
  "安芸太田",
  "北広島",
  "安芸高田",
  "大竹市",
  "廿日市",
  "広島市",
  "呉市",
  "東広島市",
  "三次市",
  "世羅町",
  "庄原市",
  "神石高原",
  "府中市",
  "福山市",
  "三原市",
  "坂町"
] as const;

const KURE_SUBLOCATIONS = [
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
] as const;

export const LOCATION_OPTIONS = [
  ...NON_KURE_LOCATIONS,
  ...KURE_SUBLOCATIONS.map((location) => `呉市${location}`)
] as const;

type LocationOption = (typeof LOCATION_OPTIONS)[number];

const LOCATION_ALIAS_ENTRIES = [
  { alias: "東広島", canonical: "東広島市" },
  { alias: "広・阿賀", canonical: "呉市広阿賀" },
  { alias: "広阿賀", canonical: "呉市広阿賀" },
  { alias: "呉市広・阿賀", canonical: "呉市広阿賀" },
  { alias: "呉市広阿賀", canonical: "呉市広阿賀" },
  ...LOCATION_OPTIONS.map((location) => ({ alias: location, canonical: location })),
  ...KURE_SUBLOCATIONS.filter((location) => location !== "広阿賀").map((location) => ({
    alias: location,
    canonical: `呉市${location}` as LocationOption
  }))
] as const;

const SORTED_LOCATION_OPTIONS = [...LOCATION_OPTIONS].sort((left, right) => right.length - left.length);
const SORTED_LOCATION_ALIASES = [...LOCATION_ALIAS_ENTRIES].sort(
  (left, right) => normalizeLocationText(right.alias).length - normalizeLocationText(left.alias).length
);

export function normalizeLocationText(text: string) {
  return text.replace(/\s+/g, "").replace(/[・･·]/g, "").trim();
}

export function isKnownLocationOption(value: string) {
  return LOCATION_OPTIONS.includes(value as LocationOption);
}

export function findKnownLocations(text: string) {
  const normalized = normalizeLocationText(text);
  const matches = new Set<string>();

  for (const entry of SORTED_LOCATION_ALIASES) {
    if (normalized.includes(normalizeLocationText(entry.alias))) {
      matches.add(entry.canonical);
    }
  }

  for (const location of SORTED_LOCATION_OPTIONS) {
    if (normalized.includes(normalizeLocationText(location))) {
      matches.add(location);
    }
  }

  const sortedMatches = [...matches].sort((left, right) => right.length - left.length);

  return sortedMatches.filter((location, index) => {
    const normalizedLocation = normalizeLocationText(location);
    return !sortedMatches.some((other, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }

      const normalizedOther = normalizeLocationText(other);
      return normalizedOther.length > normalizedLocation.length && normalizedOther.includes(normalizedLocation);
    });
  });
}

export function resolveKnownLocation(text: string) {
  const matches = findKnownLocations(text);
  if (matches.length === 0) {
    return "";
  }

  const preferredKureLocation = matches.find((location) => location.startsWith("呉市") && location !== "呉市");
  return preferredKureLocation || matches[0];
}
