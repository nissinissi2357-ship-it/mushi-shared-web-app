import { NextResponse } from "next/server";
import { getViewerFromSession, updateOwnAccount } from "@/lib/data";
import { clearSession, readSession, writeSession } from "@/lib/session";

export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);

    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const body = await request.json();
    const displayName = String(body.displayName || "").trim();
    const passcode = String(body.passcode || "").trim();

    const member = await updateOwnAccount(viewer.member.id, { displayName, passcode });
    await clearSession();
    await writeSession(member);

    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "アカウント更新に失敗しました。" },
      { status: 400 }
    );
  }
}
