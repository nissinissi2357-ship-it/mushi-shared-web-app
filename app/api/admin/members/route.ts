import { NextResponse } from "next/server";
import { createMember } from "@/lib/data";
import type { MemberRole } from "@/lib/types";

const MEMBER_MANAGEMENT_PASSCODE = "0000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const adminPasscode = String(body.adminPasscode || "").trim();
    const displayName = String(body.displayName || "").trim();
    const passcode = String(body.passcode || "").trim();
    const role = String(body.role || "member") as MemberRole;

    if (adminPasscode !== MEMBER_MANAGEMENT_PASSCODE) {
      return NextResponse.json({ error: "隊員管理のパスワードが違います。" }, { status: 403 });
    }

    const member = await createMember(displayName, passcode, role);
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "アカウント作成に失敗しました。" },
      { status: 400 }
    );
  }
}
