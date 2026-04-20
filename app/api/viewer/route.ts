import { NextResponse } from "next/server";
import { getViewerFromSession } from "@/lib/data";
import { readSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);

    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    return NextResponse.json(viewer, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "最新データの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
