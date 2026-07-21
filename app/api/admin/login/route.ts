import { NextResponse } from "next/server";
import { loginAdminByPasscode } from "@/lib/data";
import { writeSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const passcode = String(body.passcode || "").trim();

    const result = await loginAdminByPasscode(passcode);
    await writeSession(result.member);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ログインに失敗しました。" },
      { status: 400 }
    );
  }
}
