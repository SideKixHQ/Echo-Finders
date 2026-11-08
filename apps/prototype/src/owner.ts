/**
 * Owner mode: every echo unlocked and playable from anywhere, on James's phone only.
 *
 * James (2026-11-08): "when i use the app for me. I need all echos open", unlocked and
 * playable wherever he is, to check content and audio. A private link
 * (`/?owner=<code>`) asks `/api/owner` whether the code is right; only then is the phone
 * marked, here, in its own storage. The code itself is never kept. Settings › Privacy
 * turns it off again.
 */

const KEY = "echo-finders:owner";

export function ownerMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setOwnerMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    /* Private browsing: owner mode lasts this visit only. */
  }
}

/**
 * `?owner=<code>` on the address: check it, mark the phone if it is right, and take the
 * code off the address either way so it is not left in history or a shared link.
 * Resolves to whether owner mode is now on.
 */
export async function claimOwnerFromAddress(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("owner");
  if (code === null) return ownerMode();
  params.delete("owner");
  const rest = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  try {
    const res = await fetch("/api/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) setOwnerMode(true);
  } catch {
    /* Offline: leave things as they were. */
  }
  return ownerMode();
}
