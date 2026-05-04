import { NextResponse } from "next/server";
import { getPublicViewer } from "@/lib/data";

export async function GET() {
  try {
    const viewer = await getPublicViewer();
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
