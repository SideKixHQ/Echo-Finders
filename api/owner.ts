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
 */
import { timingSafeEqual } from "node:crypto";
import { reply } from "./_stripe.js";

function same(given: string, want: string | undefined): boolean {
  if (!want) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const owner = process.env.OWNER_CODE;
  const tester = process.env.TESTER_CODE;
  if (!owner && !tester) return reply(503, { error: "Owner mode is not set up." });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const given = typeof body.code === "string" ? body.code : "";
  if (same(given, owner)) return reply(200, { ok: true, role: "owner" });
  if (same(given, tester)) return reply(200, { ok: true, role: "tester" });
  return reply(403, { error: "That link is not right." });
}
