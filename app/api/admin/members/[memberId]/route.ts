import { NextResponse } from "next/server";
import {
  adminDeleteMember,
  adminResetMemberPasscode,
  adminUpdateMemberRole,
  getViewerFromSession
} from "@/lib/data";
import { readSession } from "@/lib/session";
import type { MemberRole } from "@/lib/types";

async function requireAdminViewer() {
  const session = await readSession();
  const viewer = await getViewerFromSession(session);

  if (!viewer || viewer.member.role !== "admin") {
    return null;
  }

  return viewer;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ memberId: string }> }
) {
  try {
    const viewer = await requireAdminViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Admin アカウントでログインしてください。" }, { status: 403 });
    }

    const { memberId } = await context.params;
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "reset-passcode") {
      await adminResetMemberPasscode(memberId);
      return NextResponse.json({ ok: true });
    }

    if (action === "update-role") {
      const role = String(body.role || "member") as MemberRole;
      const member = await adminUpdateMemberRole(viewer.member.id, memberId, role);
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
    const viewer = await requireAdminViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Admin アカウントでログインしてください。" }, { status: 403 });
    }

    const { memberId } = await context.params;

    await adminDeleteMember(viewer.member.id, memberId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました。" },
      { status: 400 }
    );
  }
}
