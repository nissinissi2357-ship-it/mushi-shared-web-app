import { resolveKnownLocation } from "@/lib/locations";

export type ParsedCaptainMessage = {
  sourceText: string;
  observedAt: string;
  location: string;
  species: string;
  points: number | null;
  scoringMemo: string;
  guidePdfName: string;
};

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

    if (resolveKnownLocation(line)) {
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

    return Boolean(resolveKnownLocation(line));
  });

  const locationFromMemo = resolveKnownLocation(scoringLine);
  const locationFromExplicitLine = explicitLocationLine ? resolveKnownLocation(explicitLocationLine) : "";

  const pdfName = pdfLines
    .map((line) => line.match(/([^\\/:*?"<>|\r\n]+\.pdf)\b/i)?.[1] || line)
    .find(Boolean) || "";

  return {
    sourceText: rawText.trim(),
    observedAt,
    location: locationFromExplicitLine || locationFromMemo,
    species: speciesFromPdf || speciesCandidates.at(-1) || "",
    points,
    scoringMemo: scoringLine,
    guidePdfName: pdfName
  };
}
