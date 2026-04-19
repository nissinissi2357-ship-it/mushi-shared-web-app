import { createHash } from "node:crypto";

export function hashPasscode(passcode: string): string {
  return createHash("sha256").update(passcode).digest("hex");
}
