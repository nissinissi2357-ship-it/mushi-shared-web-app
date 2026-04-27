import { NextResponse } from "next/server";
import { getViewerFromSession, insertObservation } from "@/lib/data";
import { isKnownLocationOption } from "@/lib/locations";
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
    const locationDetail = String(body.locationDetail || "").trim();
    const species = String(body.species || "").trim();
    const scoringMemo = String(body.scoringMemo || "").trim();
    const points = Number(body.points);
    const latitude = body.latitude === null || body.latitude === undefined || body.latitude === "" ? null : Number(body.latitude);
    const longitude =
      body.longitude === null || body.longitude === undefined || body.longitude === "" ? null : Number(body.longitude);

    if (!observedAt || !location || !species || Number.isNaN(points)) {
      return NextResponse.json({ error: "必須項目を入力してください。" }, { status: 400 });
    }

    if (!isKnownLocationOption(location)) {
      return NextResponse.json({ error: "観察地域は一覧から選んでください。" }, { status: 400 });
    }

    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      return NextResponse.json({ error: "地図の座標が正しくありません。" }, { status: 400 });
    }

    const inserted = await insertObservation(
      {
        observedAt,
        location,
        locationDetail,
        latitude,
        longitude,
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
