import { NextResponse } from "next/server";
import { getMemberById, insertObservation } from "@/lib/data";
import { isKnownLocationOption } from "@/lib/locations";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const memberId = String(body.memberId || "").trim();
    const observedAt = String(body.observedAt || "").trim();
    const location = String(body.location || "").trim();
    const locationDetail = String(body.locationDetail || "").trim();
    const species = String(body.species || "").trim();
    const orderName = String(body.orderName || "").trim();
    const familyName = String(body.familyName || "").trim();
    const scientificName = String(body.scientificName || "").trim();
    const scoringMemo = String(body.scoringMemo || "").trim();
    const points = Number(body.points);
    const latitude = body.latitude === null || body.latitude === undefined || body.latitude === "" ? null : Number(body.latitude);
    const longitude =
      body.longitude === null || body.longitude === undefined || body.longitude === "" ? null : Number(body.longitude);

    if (!memberId || !observedAt || !location || !species || Number.isNaN(points)) {
      return NextResponse.json({ error: "必須項目を入力してください。" }, { status: 400 });
    }

    const member = await getMemberById(memberId);
    if (!member) {
      return NextResponse.json({ error: "隊員が見つかりません。" }, { status: 400 });
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
        orderName,
        familyName,
        species,
        scientificName,
        points,
        scoringMemo
      },
      member
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
