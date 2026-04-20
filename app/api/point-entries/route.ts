import { NextResponse } from "next/server";
import { getViewerFromSession, insertPointEntry } from "@/lib/data";
import { readSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const body = await request.json();
    const memberId = String(body.memberId || "").trim() || viewer.member.id;
    const awardedAt = String(body.awardedAt || "").trim();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const points = Number(body.points);

    if (!awardedAt || !title || Number.isNaN(points)) {
      return NextResponse.json({ error: "必須項目を入力してください。" }, { status: 400 });
    }

    const entry = await insertPointEntry(
      {
        memberId,
        awardedAt,
        title,
        description,
        points
      },
      viewer.member
    );

    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "追加ポイントの保存に失敗しました。" },
      { status: 400 }
    );
  }
}
