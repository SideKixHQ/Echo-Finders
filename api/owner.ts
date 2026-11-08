/**
 * POST /api/owner  { code }  ->  { ok: true }
 *
 * Owner mode, for James's own phone (2026-11-08): "when i use the app for me. I need all
 * echos open". A private link carries a code; this checks it against `OWNER_CODE` in Vercel
 * (Production, sensitive), and the app switches the phone into owner mode only if it
 * matches (`apps/prototype/src/owner.ts`). The code never ships in the app, so reading
 * the bundle does not reveal it. No `OWNER_CODE`, no owner mode for anyone.
 */
import { timingSafeEqual } from "node:crypto";
import { reply } from "./_stripe.js";

export async function POST(request: Request): Promise<Response> {
  const code = process.env.OWNER_CODE;
  if (!code) return reply(503, { error: "Owner mode is not set up." });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const given = Buffer.from(typeof body.code === "string" ? body.code : "");
  const want = Buffer.from(code);
  const ok = given.length === want.length && timingSafeEqual(given, want);
  return ok ? reply(200, { ok: true }) : reply(403, { error: "That owner link is not right." });
}
