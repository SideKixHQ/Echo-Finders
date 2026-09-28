/**
 * Whether to hold the screen awake, and why.
 *
 * ## The problem this exists for
 *
 * ADR-0001 makes the client a web app, for good reasons about seat-back browsers and
 * people who install nothing before boarding. The bill for that decision lands here.
 *
 * On iOS, Web Audio and geolocation are both suspended the moment the screen locks or the
 * browser goes to the background. So `location-background` in the sibling module is not
 * merely hard to be granted on the web, it does not exist: there is no permission to ask
 * for. What that capability promises — an echo opening with the phone pocketed and the
 * screen off — cannot be delivered by a web client at all.
 *
 * `featureAvailability` already tells the truth about this. `capture-hands-free` falls
 * back to "Echoes still open — you just need the app open on screen while you walk."
 *
 * That sentence is only true if the screen stays on. A phone left alone dims after thirty
 * seconds and locks a few seconds later, which stops the fix and stops the audio, and the
 * fallback fails exactly as hard as the capability it was standing in for. Holding a wake
 * lock is what makes the promise good.
 *
 * ## Why the decision is here and not in the browser code
 *
 * Requesting the lock is one line of platform API and belongs in the adapter. *When* to
 * hold it is policy: it decides how much of somebody's battery we spend, and it has to
 * survive being reimplemented against a native shell where the correct answer is
 * different again. Policy lives in the engine, where it can be tested without a browser.
 *
 * ## The rules
 *
 * Hold it while a walk is running, because an echo can open at any moment and a locked
 * screen would miss it. Hold it while audio is playing, because on iOS the audio dies
 * with the screen. Never hold it otherwise: a lock held over a list of echoes somebody is
 * reading in bed is just battery we took without asking.
 */

export interface ScreenAwakeInput {
  /** A walk is running: position is being watched and an echo may open at any moment. */
  readonly walking: boolean;
  /** Audio is playing right now. */
  readonly playing: boolean;
  /**
   * The page is visible.
   *
   * A wake lock is released automatically when the page is hidden and cannot be
   * re-acquired until it comes back, so asking while hidden is a call that can only fail.
   * The adapter still has to re-request on the way back, which is the single most common
   * thing people get wrong with this API.
   */
  readonly visible: boolean;
  /** The listener has not turned the behaviour off. */
  readonly allowed: boolean;
}

export type ScreenAwakeDecision =
  | {
      readonly hold: true;
      /** Which promise is being kept. The UI says this out loud rather than holding the screen silently. */
      readonly because: "walking" | "listening";
    }
  | {
      readonly hold: false;
      readonly because: "hidden" | "idle" | "declined";
    };

/**
 * Note the order: `declined` is checked before `hidden`, so a listener who has turned this
 * off is never told the screen is being held for a reason that does not apply to them.
 */
export function screenAwake(input: ScreenAwakeInput): ScreenAwakeDecision {
  if (!input.allowed) return { hold: false, because: "declined" };
  if (!input.visible) return { hold: false, because: "hidden" };
  // Walking outranks listening because it is the stronger claim: an echo that opens
  // while the screen is off is an echo missed, not merely an echo paused.
  if (input.walking) return { hold: true, because: "walking" };
  if (input.playing) return { hold: true, because: "listening" };
  return { hold: false, because: "idle" };
}

/** What to tell the listener, in the words the walk screen uses. */
export function screenAwakeNote(decision: ScreenAwakeDecision): string {
  if (!decision.hold) return "";
  return decision.because === "walking"
    ? "Screen staying on so the walk keeps tracking"
    : "Screen staying on so the audio keeps playing";
}
