/**
 * Owner and tester mode: every echo unlocked and playable from anywhere.
 *
 * James (2026-11-08): "when i use the app for me. I need all echos open", unlocked and
 * playable wherever he is, to check content and audio. A private link
 * (`/?owner=<code>`) asks `/api/owner` whether the code is right; only then is the phone
 * marked, here, in its own storage. Settings › Privacy turns it off again.
 *
 * The same link with the tester code (James, 2026-11-08: "I need one tester code") makes a
 * tester phone. That one keeps its code and asks again each time the app opens, so
 * changing `TESTER_CODE` in Vercel turns every tester off. James's phone keeps no code and
 * never asks again, so rotating the tester code cannot lock him out.
 */

const KEY = "echo-finders:owner";
const TESTER = "tester:";

export type AccessRole = "owner" | "tester";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Who this phone is, if anybody special. */
export function accessRole(): AccessRole | null {
  const value = read();
  if (value === "on") return "owner";
  if (value?.startsWith(TESTER)) return "tester";
  return null;
}

export function ownerMode(): boolean {
  return accessRole() !== null;
}

function write(value: string | null): void {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* Private browsing: the mode lasts this visit only. */
  }
}

/** On is owner mode (only ever turned on by a checked link); off clears either mode. */
export function setOwnerMode(on: boolean): void {
  write(on ? "on" : null);
}

async function check(code: string): Promise<Response> {
  return fetch("/api/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

/**
 * `?owner=<code>` on the address: check it, mark the phone if it is right, and take the
 * code off the address either way so it is not left in history or a shared link. With no
 * code on the address, a tester phone asks whether its code still stands.
 * Resolves to who the phone now is.
 */
export async function claimOwnerFromAddress(): Promise<AccessRole | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("owner");
  if (code === null) return recheckTester();
  params.delete("owner");
  const rest = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  try {
    const res = await check(code);
    if (res.ok) {
      const { role } = (await res.json()) as { role?: AccessRole };
      write(role === "tester" ? TESTER + code : "on");
    }
  } catch {
    /* Offline: leave things as they were. */
  }
  return accessRole();
}

/** A tester phone whose code has been changed in Vercel goes back to normal. */
async function recheckTester(): Promise<AccessRole | null> {
  const value = read();
  if (!value?.startsWith(TESTER)) return accessRole();
  try {
    const res = await check(value.slice(TESTER.length));
    // Only a definite no turns it off: offline, or the server having a bad minute, does not.
    if (res.status === 403 || res.status === 503) write(null);
  } catch {
    /* Offline: keep it. */
  }
  return accessRole();
}
