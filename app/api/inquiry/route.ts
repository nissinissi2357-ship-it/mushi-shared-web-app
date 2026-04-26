import { NextResponse } from "next/server";
import { listInquiryObservations } from "@/lib/data";
import { readSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const logs = await listInquiryObservations();
    return NextResponse.json(
      { logs },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "記録照会データの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
