import { NextResponse } from "next/server";
import { deleteObservation, getViewerFromSession, updateObservation } from "@/lib/data";
import { readSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ logId: string }> }
) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const { logId } = await context.params;
    const body = await request.json();
    const observedAt = String(body.observedAt || "").trim();
    const location = String(body.location || "").trim();
    const species = String(body.species || "").trim();
    const scoringMemo = String(body.scoringMemo || "").trim();
    const points = Number(body.points);
    const latitude = body.latitude === null || body.latitude === undefined || body.latitude === "" ? null : Number(body.latitude);
    const longitude =
      body.longitude === null || body.longitude === undefined || body.longitude === "" ? null : Number(body.longitude);

    if (!observedAt || !location || !species || Number.isNaN(points)) {
      return NextResponse.json({ error: "必須項目を入力してください。" }, { status: 400 });
    }

    if ((latitude !== null && Number.isNaN(latitude)) || (longitude !== null && Number.isNaN(longitude))) {
      return NextResponse.json({ error: "地図の座標が正しくありません。" }, { status: 400 });
    }

    const updated = await updateObservation(
      logId,
      {
        observedAt,
        location,
        latitude,
        longitude,
        species,
        points,
        scoringMemo
      },
      viewer.member
    );

    return NextResponse.json({ log: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "観察ログの更新に失敗しました。" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ logId: string }> }
) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const { logId } = await context.params;
    await deleteObservation(logId, viewer.member);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "観察ログの削除に失敗しました。" },
      { status: 400 }
    );
  }
}
