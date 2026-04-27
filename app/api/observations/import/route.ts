import { getViewerFromSession, insertObservation, listMembers } from "@/lib/data";
import { isKnownLocationOption } from "@/lib/locations";
import { readSession } from "@/lib/session";
import type { Member } from "@/lib/types";

const HEADER_ALIASES: Record<string, string> = {
  "観察日時": "observedAt",
  "隊員": "memberDisplayName",
  "場所": "location",
  "観察地域": "location",
  "詳細場所": "locationDetail",
  "緯度": "latitude",
  "経度": "longitude",
  "種名": "species",
  "ポイント": "points",
  "隊長メモ": "scoringMemo"
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`数値として読めない値があります: ${value}`);
  }

  return parsed;
}

function parseRows(csvText: string) {
  const rows = parseCsv(csvText)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length < 2) {
    throw new Error("CSVに取り込めるデータがありません。");
  }

  const headerRow = rows[0];
  const headerMap = headerRow.map((header) => HEADER_ALIASES[normalizeHeader(header)] || normalizeHeader(header));

  return rows.slice(1).map((row, index) => {
    const record = Object.fromEntries(headerMap.map((key, columnIndex) => [key, row[columnIndex] ?? ""]));

    if (!record.observedAt || !record.location || !record.species || !record.points) {
      throw new Error(`${index + 2}行目に必須項目の不足があります。`);
    }

    if (!isKnownLocationOption(record.location)) {
      throw new Error(`${index + 2}行目の観察地域が一覧にありません。`);
    }

    return {
      observedAt: record.observedAt,
      memberDisplayName: record.memberDisplayName,
      location: record.location,
      locationDetail: record.locationDetail || "",
      latitude: parseOptionalNumber(record.latitude),
      longitude: parseOptionalNumber(record.longitude),
      species: record.species,
      points: parseOptionalNumber(record.points),
      scoringMemo: record.scoringMemo || ""
    };
  });
}

function resolveImportMember(
  viewer: Member,
  members: Member[],
  rowMemberDisplayName: string,
  selectedMemberId: string | null
) {
  if (viewer.role !== "captain" && viewer.role !== "admin") {
    return viewer;
  }

  if (selectedMemberId) {
    const selectedMember = members.find((member) => member.id === selectedMemberId);
    if (!selectedMember) {
      throw new Error("取り込み先の隊員が見つかりません。");
    }
    return selectedMember;
  }

  const normalizedName = rowMemberDisplayName.trim();
  if (!normalizedName) {
    throw new Error("隊長またはAdminのCSV取り込みでは、隊員列か取り込み先指定が必要です。");
  }

  const member = members.find((candidate) => candidate.displayName === normalizedName);
  if (!member) {
    throw new Error(`隊員が見つかりません: ${normalizedName}`);
  }

  return member;
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);

    if (!viewer) {
      return Response.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const selectedMemberId = String(formData.get("memberId") || "").trim() || null;

    if (!(file instanceof File)) {
      return Response.json({ error: "CSVファイルを選んでください。" }, { status: 400 });
    }

    const text = await file.text();
    const parsedRows = parseRows(text);
    const members = await listMembers();

    for (const row of parsedRows) {
      const targetMember = resolveImportMember(viewer.member, members, row.memberDisplayName, selectedMemberId);

      await insertObservation(
        {
          observedAt: new Date(row.observedAt).toISOString(),
          location: row.location,
          locationDetail: row.locationDetail,
          latitude: row.latitude,
          longitude: row.longitude,
          species: row.species,
          points: row.points ?? 0,
          scoringMemo: row.scoringMemo
        },
        targetMember
      );
    }

    return Response.json({ importedCount: parsedRows.length });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "CSV取り込みに失敗しました。"
      },
      { status: 500 }
    );
  }
}
