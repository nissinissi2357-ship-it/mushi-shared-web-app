import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Member } from "@/lib/types";

const SESSION_COOKIE_NAME = "mushi_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type SessionPayload = {
  memberId: string;
  displayName: string;
  role: Member["role"];
};

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  return verifySession(raw);
}

export async function writeSession(member: Member): Promise<void> {
  const cookieStore = await cookies();
  const payload: SessionPayload = {
    memberId: member.id,
    displayName: member.displayName,
    role: member.role
  };

  cookieStore.set(SESSION_COOKIE_NAME, signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

function signSession(payload: SessionPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySession(raw: string): SessionPayload | null {
  const [encodedPayload, encodedSignature] = raw.split(".");
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");

  const provided = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.memberId || !parsed.displayName || !parsed.role) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getSessionSecret(): string {
  return (
    process.env.APP_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "local-dev-secret"
  );
}
