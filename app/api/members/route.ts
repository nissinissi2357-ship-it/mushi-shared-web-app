import { NextResponse } from "next/server";
import { createMember, listMembers } from "@/lib/data";

export async function GET() {
  try {
    const members = await listMembers();
    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "隊員一覧の取得に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const displayName = String(body.displayName || "").trim();
    const passcode = String(body.passcode || "").trim();

    const member = await createMember(displayName, passcode, "member");
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "隊員登録に失敗しました。" },
      { status: 400 }
    );
  }
}
