import { NextResponse } from "next/server";
import { deletePointEntry, getViewerFromSession, updatePointEntry } from "@/lib/data";
import { readSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ entryId: string }> }
) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const { entryId } = await context.params;
    const body = await request.json();
    const memberId = String(body.memberId || "").trim() || viewer.member.id;
    const awardedAt = String(body.awardedAt || "").trim();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const points = Number(body.points);

    if (!awardedAt || !title || Number.isNaN(points)) {
      return NextResponse.json({ error: "必須項目を入力してください。" }, { status: 400 });
    }

    const entry = await updatePointEntry(
      entryId,
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
      { error: error instanceof Error ? error.message : "追加ポイントの更新に失敗しました。" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ entryId: string }> }
) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const { entryId } = await context.params;
    await deletePointEntry(entryId, viewer.member);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "追加ポイントの削除に失敗しました。" },
      { status: 400 }
    );
  }
}
