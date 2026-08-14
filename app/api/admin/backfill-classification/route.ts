import { NextResponse } from "next/server";
import { backfillObservationClassifications, getViewerFromSession } from "@/lib/data";
import { readSession } from "@/lib/session";

// 分類の一括反映は件数が多いと時間がかかるため、実行時間を延長する。
export const maxDuration = 60;

export async function POST() {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);

    if (!viewer || viewer.member.role !== "admin") {
      return NextResponse.json({ error: "Admin アカウントでログインしてください。" }, { status: 403 });
    }

    const result = await backfillObservationClassifications();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分類の一括反映に失敗しました。" },
      { status: 500 }
    );
  }
}
