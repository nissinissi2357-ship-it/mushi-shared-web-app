import { getViewerFromSession, listExportLogs } from "@/lib/data";
import { readSession } from "@/lib/session";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildExcelXml(
  title: string,
  rows: Array<{
    observedAt: string;
    memberDisplayName: string;
    location: string;
    latitude?: number | null;
    longitude?: number | null;
    species: string;
    points: number;
    scoringMemo: string;
    imageUrl?: string | null;
    guidePdfUrl?: string | null;
  }>
) {
  const headers = [
    "観察日時",
    "隊員",
    "場所",
    "緯度",
    "経度",
    "種名",
    "ポイント",
    "隊長メモ",
    "写真URL",
    "図鑑PDF URL"
  ];

  const headerCells = headers
    .map((label) => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(label)}</Data></Cell>`)
    .join("");

  const dataRows = rows
    .map(
      (row) => `
      <Row>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.observedAt)}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.memberDisplayName)}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.location)}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.latitude?.toString() || "")}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.longitude?.toString() || "")}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.species)}</Data></Cell>
        <Cell ss:StyleID="number"><Data ss:Type="Number">${row.points}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.scoringMemo || "")}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.imageUrl || "")}</Data></Cell>
        <Cell ss:StyleID="text"><Data ss:Type="String">${escapeXml(row.guidePdfUrl || "")}</Data></Cell>
      </Row>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#2F6B3F" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="text">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="number">
   <Alignment ss:Horizontal="Right" ss:Vertical="Top"/>
   <NumberFormat ss:Format="0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(title.slice(0, 31) || "観察ログ")}">
  <Table>
   <Column ss:Width="130"/>
   <Column ss:Width="90"/>
   <Column ss:Width="120"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="120"/>
   <Column ss:Width="70"/>
   <Column ss:Width="240"/>
   <Column ss:Width="180"/>
   <Column ss:Width="180"/>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "all";
}

export async function GET(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);

    if (!viewer) {
      return Response.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");
    const exportLogs = await listExportLogs(viewer.member, memberId);

    const selectedMemberName =
      memberId && (viewer.member.role === "captain" || viewer.member.role === "admin")
        ? exportLogs[0]?.memberDisplayName || "selected"
        : viewer.member.role === "captain" || viewer.member.role === "admin"
          ? "all"
          : viewer.member.displayName;

    const workbookTitle =
      viewer.member.role === "captain" || viewer.member.role === "admin"
        ? memberId
          ? `${selectedMemberName}の観察ログ`
          : "全員の観察ログ"
        : `${viewer.member.displayName}の観察ログ`;

    const xml = buildExcelXml(workbookTitle, exportLogs);
    const fileName = `mushi-observations-${sanitizeFileNamePart(selectedMemberName)}-${new Date()
      .toISOString()
      .slice(0, 10)}.xls`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Excel出力に失敗しました。"
      },
      { status: 500 }
    );
  }
}
