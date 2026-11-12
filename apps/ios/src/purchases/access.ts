/**
 * Settings › Skeleton key, the pure half: what `/api/owner` said, and what the phone keeps.
 *
 * The web app marks the phone in localStorage and the server sets an HttpOnly cookie
 * (`apps/prototype/src/owner.ts`, `api/owner.ts`). The phone has neither, so it keeps the
 * role in its own file after a right key. As on the web, a tester (or the App Store
 * reviewer, whose `REVIEWER_CODE` opens tester mode) keeps the code and is asked again at
 * each launch, so changing the code in Vercel turns them off; the owner keeps no code and
 * is never asked again, so rotating a tester code cannot lock James out.
 */
import type { AccessRole } from "./entitlement";

/** What a key typed into Settings came to. The web app's `KeyResult`. */
export type KeyResult = AccessRole | "wrong" | "offline";

/** What the phone keeps: the role, and for a tester the code to ask with again. */
export interface StoredAccess {
  readonly role: AccessRole;
  readonly code?: string;
}

/** The answer to `POST /api/owner { code }`. */
export function keyResult(status: number, body: unknown): KeyResult {
  if (status >= 200 && status < 300) {
    const role = (body as { role?: unknown } | null)?.role;
    return role === "tester" ? "tester" : "owner";
  }
  return status === 403 || status === 400 ? "wrong" : "offline";
}

/** What to keep after a right key. */
export function accessToStore(result: KeyResult, code: string): StoredAccess | null {
  if (result === "owner") return { role: "owner" };
  if (result === "tester") return { role: "tester", code: code.trim() };
  return null;
}

/** The phone's file, read defensively: anything odd is nobody special. */
export function parseAccess(raw: unknown): StoredAccess | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { role, code } = raw as { role?: unknown; code?: unknown };
  if (role === "owner") return { role };
  if (role === "tester" && typeof code === "string" && code) return { role, code };
  return null;
}

/**
 * A tester phone asking again at launch: only a definite no turns it off (the web's
 * `recheckTester`). Offline, or the server having a bad minute, keeps it.
 */
export function stillTester(status: number | null): boolean {
  return !(status === 403 || status === 503);
}
