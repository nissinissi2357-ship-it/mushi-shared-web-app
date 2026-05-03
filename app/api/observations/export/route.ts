import { getPublicActor, listExportLogs } from "@/lib/data";

function escapeCsv(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(
  rows: Array<{
    observedAt: string;
    memberDisplayName: string;
    location: string;
    locationDetail?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    orderName?: string | null;
    familyName?: string | null;
    species: string;
    scientificName?: string | null;
    points: number;
    scoringMemo: string;
    imageUrl?: string | null;
    guidePdfUrl?: string | null;
  }>
) {
  const headers = [
    "観察日時",
    "隊員",
    "観察地域",
    "詳細場所",
    "緯度",
    "経度",
    "目名",
    "科名",
    "種名",
    "学名",
    "ポイント",
    "隊長メモ",
    "写真URL",
    "図鑑PDF URL"
  ];

  const lines = [
    headers.map((header) => escapeCsv(header)).join(","),
    ...rows.map((row) =>
      [
        row.observedAt,
        row.memberDisplayName,
        row.location,
        row.locationDetail || "",
        row.latitude ?? "",
        row.longitude ?? "",
        row.orderName || "",
        row.familyName || "",
        row.species,
        row.scientificName || "",
        row.points,
        row.scoringMemo || "",
        row.imageUrl || "",
        row.guidePdfUrl || ""
      ]
        .map((value) => escapeCsv(value))
        .join(",")
    )
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "all";
}

export async function GET(request: Request) {
  try {
    const viewer = getPublicActor();
    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");
    const exportLogs = await listExportLogs(viewer, memberId);

    const selectedMemberName =
      memberId && (viewer.role === "captain" || viewer.role === "admin")
        ? exportLogs[0]?.memberDisplayName || "selected"
        : viewer.role === "captain" || viewer.role === "admin"
          ? "all"
          : viewer.displayName;

    const csv = buildCsv(exportLogs);
    const fileName = `mushi-observations-${sanitizeFileNamePart(selectedMemberName)}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "CSV出力に失敗しました。"
      },
      { status: 500 }
    );
  }
}
