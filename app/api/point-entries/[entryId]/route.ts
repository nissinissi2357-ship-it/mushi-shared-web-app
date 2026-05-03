import { NextResponse } from "next/server";
import { deletePointEntry, getPublicActor, updatePointEntry } from "@/lib/data";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await context.params;
    const body = await request.json();
    const memberId = String(body.memberId || "").trim();
    const awardedAt = String(body.awardedAt || "").trim();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const points = Number(body.points);

    if (!memberId || !awardedAt || !title || Number.isNaN(points)) {
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
      getPublicActor()
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
    const { entryId } = await context.params;
    await deletePointEntry(entryId, getPublicActor());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "追加ポイントの削除に失敗しました。" },
      { status: 400 }
    );
  }
}
