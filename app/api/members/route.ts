import { NextResponse } from "next/server";
import { registerMember } from "@/lib/data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const displayName = String(body.displayName || "").trim();
    const passcode = String(body.passcode || "").trim();

    const member = await registerMember(displayName, passcode, "member");
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "隊員登録に失敗しました。" },
      { status: 400 }
    );
  }
}
