import { NextResponse } from "next/server";
import { createMember, getViewerFromSession } from "@/lib/data";
import { readSession } from "@/lib/session";
import type { MemberRole } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);

    if (!viewer || viewer.member.role !== "admin") {
      return NextResponse.json({ error: "Admin だけが使えます。" }, { status: 403 });
    }

    const body = await request.json();
    const displayName = String(body.displayName || "").trim();
    const passcode = String(body.passcode || "").trim();
    const role = String(body.role || "member") as MemberRole;

    const member = await createMember(displayName, passcode, role);
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "アカウント作成に失敗しました。" },
      { status: 400 }
    );
  }
}
