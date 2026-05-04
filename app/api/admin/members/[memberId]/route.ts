import { NextResponse } from "next/server";
import {
  adminDeleteMember,
  adminResetMemberPasscode,
  adminUpdateMemberRole
} from "@/lib/data";
import type { MemberRole } from "@/lib/types";

const MEMBER_MANAGEMENT_PASSCODE = "0000";
const PUBLIC_ADMIN_ACTOR_ID = "public-viewer";

function hasValidPasscode(value: string) {
  return value.trim() === MEMBER_MANAGEMENT_PASSCODE;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await context.params;
    const body = await request.json();
    const adminPasscode = String(body.adminPasscode || "").trim();
    const action = String(body.action || "");

    if (!hasValidPasscode(adminPasscode)) {
      return NextResponse.json({ error: "隊員管理のパスワードが違います。" }, { status: 403 });
    }

    if (action === "reset-passcode") {
      await adminResetMemberPasscode(memberId);
      return NextResponse.json({ ok: true });
    }

    if (action === "update-role") {
      const role = String(body.role || "member") as MemberRole;
      const member = await adminUpdateMemberRole(PUBLIC_ADMIN_ACTOR_ID, memberId, role);
      return NextResponse.json({ member });
    }

    return NextResponse.json({ error: "対応していない操作です。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新に失敗しました。" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const adminPasscode = String(body.adminPasscode || "").trim();

    if (!hasValidPasscode(adminPasscode)) {
      return NextResponse.json({ error: "隊員管理のパスワードが違います。" }, { status: 403 });
    }

    await adminDeleteMember(PUBLIC_ADMIN_ACTOR_ID, memberId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました。" },
      { status: 400 }
    );
  }
}
