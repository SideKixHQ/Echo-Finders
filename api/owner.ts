/**
 * POST /api/owner  { code }  ->  { ok: true, role: "owner" | "tester" }
 *
 * Owner mode, for James's own phone (2026-11-08): "when i use the app for me. I need all
 * echos open". A private link carries a code; this checks it against `OWNER_CODE` in Vercel
 * (Production, sensitive), and the app switches the phone into owner mode only if it
 * matches (`apps/prototype/src/owner.ts`). The code never ships in the app, so reading
 * the bundle does not reveal it.
 *
 * Tester mode is the same thing for people James hands a link to (2026-11-08: "I need one
 * tester code"), against `TESTER_CODE`. A tester phone asks again every time the app
 * opens, so changing `TESTER_CODE` in Vercel turns every tester off; James's own phone
 * does not, so changing the tester code never locks him out.
 *
 * Neither variable set, no owner or tester mode for anyone.
 *
 * REMEMBERED BY A COOKIE TOO (James, 2026-11-10: "What happened to my free owner account").
 * The phone's own mark lives in localStorage, which iPhone Safari deletes after about a week
 * without a visit, and which Safari and a home-screen icon do not share. So a right code also
 * sets `ef_access`: HttpOnly, Secure, SameSite=Strict, scoped to this endpoint, for 400 days
 * (the longest a browser keeps one). It holds the role and an HMAC of it keyed by that role's
 * code, never the code itself, so changing `OWNER_CODE` or `TESTER_CODE` voids every cookie
 * made with the old one. GET reads it back for a phone whose storage was wiped; DELETE
 * clears it when owner mode is turned off or the app is started over.
 *
 * GET    /api/owner  ->  { role: "owner" | "tester" | null }
 * DELETE /api/owner  ->  { ok: true }, and the cookie is gone
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { reply } from "./_stripe.js";

function same(given: string, want: string | undefined): boolean {
  if (!want) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Role = "owner" | "tester";
const COOKIE = "ef_access";
const YEAR_AND_A_BIT = 400 * 24 * 60 * 60;

/** The role, signed with the code that opened it: proof without the code itself. */
function sign(role: Role, code: string): string {
  return createHmac("sha256", code).update(`echo-finders:${role}`).digest("base64url");
}

function cookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/api/owner; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function withCookie(res: Response, value: string, maxAge: number): Response {
  res.headers.append("Set-Cookie", cookie(value, maxAge));
  return res;
}

/** Which role the request's cookie proves against today's codes, if any. */
function roleFromCookie(request: Request): Role | null {
  const raw = request.headers.get("cookie") ?? "";
  const value = raw.split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value) return null;
  const [role, sig] = value.split(".");
  if (!sig) return null;
  const code = role === "owner" ? process.env.OWNER_CODE : role === "tester" ? process.env.TESTER_CODE : undefined;
  if (!code) return null;
  return same(sig, sign(role as Role, code)) ? (role as Role) : null;
}

export async function POST(request: Request): Promise<Response> {
  const owner = process.env.OWNER_CODE;
  const tester = process.env.TESTER_CODE;
  if (!owner && !tester) return reply(503, { error: "Owner mode is not set up." });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const given = typeof body.code === "string" ? body.code : "";
  if (owner && same(given, owner)) {
    return withCookie(reply(200, { ok: true, role: "owner" }), `owner.${sign("owner", owner)}`, YEAR_AND_A_BIT);
  }
  if (tester && same(given, tester)) {
    return withCookie(reply(200, { ok: true, role: "tester" }), `tester.${sign("tester", tester)}`, YEAR_AND_A_BIT);
  }
  return reply(403, { error: "That link is not right." });
}

/** Who this phone was, by its cookie: for a phone whose own storage has been wiped. */
export async function GET(request: Request): Promise<Response> {
  const role = roleFromCookie(request);
  if (role) return reply(200, { role });
  // A cookie that no longer proves anything (the code was changed) is cleared.
  return request.headers.get("cookie")?.includes(`${COOKIE}=`)
    ? withCookie(reply(200, { role: null }), "", 0)
    : reply(200, { role: null });
}

/** Owner mode turned off, or the app started over: forget the phone here too. */
export async function DELETE(): Promise<Response> {
  return withCookie(reply(200, { ok: true }), "", 0);
}
