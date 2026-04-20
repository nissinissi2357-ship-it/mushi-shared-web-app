export type ParsedCaptainMessage = {
  sourceText: string;
  observedAt: string;
  location: string;
  species: string;
  points: number | null;
  scoringMemo: string;
  guidePdfName: string;
};

const KNOWN_LOCATIONS = [
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
  "東広島",
  "三次市",
  "世羅町",
  "庄原市",
  "神石高原",
  "府中市",
  "福山市",
  "三原市",
  "坂町",
  "旧呉市",
  "天応吉浦",
  "焼山",
  "灰ヶ峰",
  "広・阿賀",
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

const KURE_SUBLOCATIONS = [
  "旧呉市",
  "天応吉浦",
  "焼山",
  "灰ヶ峰",
  "広・阿賀",
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

const SORTED_KNOWN_LOCATIONS = [...KNOWN_LOCATIONS].sort((left, right) => right.length - left.length);

const UI_NOISE_PATTERNS = [
  /^保存$/,
  /^転送$/,
  /^Keep/,
  /^既読/,
  /^有効期限/,
  /^サイズ[:：]/,
  /^午後\s*\d/,
  /^午前\s*\d/,
  /^\d{1,2}:\d{2}$/,
  /^\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}$/
];

function normalizeLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractPoints(text: string) {
  const match = text.match(/(\d+)\s*P\b/i);
  return match ? Number(match[1]) : null;
}

function isPdfLine(line: string) {
  return /\.pdf\b/i.test(line);
}

function isUiNoise(line: string) {
  return UI_NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function normalizeLocationText(text: string) {
  return text.replace(/\s+/g, "").trim();
}

function findKnownLocations(text: string) {
  const normalized = normalizeLocationText(text);
  return SORTED_KNOWN_LOCATIONS.filter((location) =>
    normalized.includes(normalizeLocationText(location))
  );
}

function pickPreferredLocation(locations: string[]) {
  if (locations.length === 0) {
    return "";
  }

  const preferredKureLocation = locations.find((location) =>
    KURE_SUBLOCATIONS.includes(location as (typeof KURE_SUBLOCATIONS)[number])
  );

  return preferredKureLocation || locations[0];
}

function formatLocationLabel(location: string) {
  if (!location) {
    return "";
  }

  return KURE_SUBLOCATIONS.includes(location as (typeof KURE_SUBLOCATIONS)[number])
    ? `呉市${location}`
    : location;
}

function cleanSpeciesText(text: string) {
  return text
    .replace(/^図鑑\d*/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/[【】[\]()（）]/g, "")
    .replace(/_+/g, " ")
    .trim();
}

function parseObservedAt(rawText: string) {
  const fullMatch = rawText.match(
    /(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})[^\d]*(午前|午後|AM|PM|am|pm)?\s*(\d{1,2})[:：](\d{2})/
  );

  if (fullMatch) {
    const [, year, month, day, meridiem, hour, minute] = fullMatch;
    return toDatetimeLocal({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      meridiem
    });
  }

  const timeMatch = rawText.match(/(午前|午後|AM|PM|am|pm)?\s*(\d{1,2})[:：](\d{2})/);
  if (!timeMatch) {
    return "";
  }

  const now = new Date();
  const [, meridiem, hour, minute] = timeMatch;
  return toDatetimeLocal({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: Number(hour),
    minute: Number(minute),
    meridiem
  });
}

function toDatetimeLocal(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  meridiem?: string;
}) {
  let hour = input.hour;
  const meridiem = (input.meridiem || "").toLowerCase();

  if ((meridiem === "午後" || meridiem === "pm") && hour < 12) {
    hour += 12;
  }

  if ((meridiem === "午前" || meridiem === "am") && hour === 12) {
    hour = 0;
  }

  const date = new Date(input.year, input.month - 1, input.day, hour, input.minute);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function parseCaptainMessage(rawText: string): ParsedCaptainMessage {
  const lines = normalizeLines(rawText);
  const pdfLines = lines.filter(isPdfLine);
  const scoringLine = [...lines].reverse().find((line) => extractPoints(line) !== null) || "";
  const points = scoringLine ? extractPoints(scoringLine) : null;
  const observedAt = parseObservedAt(rawText);

  const speciesFromPdf = pdfLines
    .map((line) => line.match(/([^\\/:*?"<>|\r\n]+\.pdf)\b/i)?.[1] || line)
    .map(cleanSpeciesText)
    .find(Boolean);

  const speciesCandidates = lines.filter((line) => {
    if (isUiNoise(line) || isPdfLine(line) || extractPoints(line) !== null) {
      return false;
    }

    if (findKnownLocations(line).length > 0) {
      return false;
    }

    if (line.length < 2 || line.length > 30) {
      return false;
    }

    if (/[…‥]/.test(line)) {
      return false;
    }

    return true;
  });

  const explicitLocationLine = lines.find((line) => {
    if (isUiNoise(line) || isPdfLine(line) || extractPoints(line) !== null) {
      return false;
    }

    return findKnownLocations(line).length > 0;
  });

  const locationFromMemo = pickPreferredLocation(findKnownLocations(scoringLine));
  const locationFromExplicitLine = explicitLocationLine
    ? pickPreferredLocation(findKnownLocations(explicitLocationLine))
    : "";

  const pdfName = pdfLines
    .map((line) => line.match(/([^\\/:*?"<>|\r\n]+\.pdf)\b/i)?.[1] || line)
    .find(Boolean) || "";

  return {
    sourceText: rawText.trim(),
    observedAt,
    location: formatLocationLabel(locationFromExplicitLine || locationFromMemo),
    species: speciesFromPdf || speciesCandidates.at(-1) || "",
    points,
    scoringMemo: scoringLine,
    guidePdfName: pdfName
  };
}
