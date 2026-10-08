/**
 * What puts a story on the lock screen.
 *
 * James, on his iPhone (2026-10-08): the story kept playing when he locked the phone, but
 * tapping the lock screen showed no way to pause it, so he had to unlock, open the app and
 * pause there. The title and the play/pause/stop handlers were already published through
 * Media Session (`publishNowPlaying` in `wake.ts`). iOS ignores all of it unless the page
 * is playing an audio ELEMENT, and narration today is the browser's speech voice, which
 * iOS does not count as media at all.
 *
 * So this plays a short silent track on a loop for as long as a story is playing. To iOS
 * the page is then a media player, so the lock screen and Control Centre show the story
 * and route the buttons back to us. It pauses when the story pauses (so the lock screen
 * shows Play) and stops when the story stops (so the controls go away).
 *
 * When recorded voices replace the speech voice they are audio elements themselves, and
 * this file goes.
 *
 * The one wrinkle is that iOS only lets a page start audio from a tap. A story started by
 * arriving somewhere, hands-free, has no tap, so the element is primed on the first tap
 * anywhere: once it has played from a gesture, later plays are allowed.
 */

let carrier: HTMLAudioElement | null = null;

/** One second of silence, made here: 8kHz, 8-bit mono, no network. */
function silence(): string {
  const n = 8000;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128); // 128 is zero in 8-bit audio
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function element(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!carrier) {
    carrier = new Audio(silence());
    carrier.loop = true;
    carrier.setAttribute("playsinline", "");
  }
  return carrier;
}

/**
 * Prime it from the first tap, so a story that starts later without one (hands-free
 * arrival) can still reach the lock screen. Call once at start-up.
 */
export function primeLockScreen(): void {
  if (typeof document === "undefined") return;
  const once = () => {
    document.removeEventListener("pointerdown", once, true);
    const el = element();
    if (!el || !el.paused) return;
    el.play().then(() => { if (!active) el.pause(); }).catch(() => {});
  };
  document.addEventListener("pointerdown", once, true);
}

let active = false;

/**
 * Follow the story: "playing" holds the lock screen with Pause showing, "paused" keeps it
 * with Play showing, "none" lets it go.
 *
 * Never throws. If iOS refuses to play, the story itself is unaffected; the lock screen
 * simply shows nothing, which is today's behaviour.
 */
export function holdLockScreen(state: "playing" | "paused" | "none"): void {
  const el = element();
  if (!el) return;
  active = state === "playing";
  if (state === "playing") {
    if (el.paused) el.play().catch(() => {});
  } else {
    el.pause();
    if (state === "none") el.currentTime = 0;
  }
}
