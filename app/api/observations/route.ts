import { NextResponse } from "next/server";
import { getViewerFromSession, insertObservation } from "@/lib/data";
import { readSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const body = await request.json();
    const observedAt = String(body.observedAt || "").trim();
    const location = String(body.location || "").trim();
    const species = String(body.species || "").trim();
    const scoringMemo = String(body.scoringMemo || "").trim();
    const points = Number(body.points);

    if (!observedAt || !location || !species || Number.isNaN(points)) {
      return NextResponse.json({ error: "必須項目を入力してください。" }, { status: 400 });
    }

    const inserted = await insertObservation(
      {
        observedAt,
        location,
        species,
        points,
        scoringMemo
      },
      viewer.member
    );

    return NextResponse.json({ log: inserted });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "観察ログの保存に失敗しました。"
      },
      { status: 500 }
    );
  }
}
