/**
 * What the app needs permission to do, when to ask, and what still works if it is refused.
 *
 * Kept here, in the engine, rather than scattered through UI code, because the important
 * part is not the API call — it is the **policy**, and the policy has to survive being
 * reimplemented on three platforms.
 *
 * Two commitments shape all of it.
 *
 * **The app must be fully usable with foreground location alone.** Everything else is an
 * enhancement. Not a nicety: refusal rates for background location are high, App Store
 * review is sceptical of it, and an experience that collapses without it is an experience
 * most people never get to have. `featureAvailability` makes that testable rather than
 * aspirational.
 *
 * **Never ask cold.** A permission prompt fired on first launch, before anyone knows what
 * the app does, is the single most common way to lose a capability permanently — on iOS
 * a refusal cannot be re-prompted, only fixed in Settings, which nobody does. Every
 * capability below records the moment it becomes worth asking, and that moment is always
 * *after* the person has tried to do the thing that needs it.
 */

export type Capability =
  /** Where the listener is, while they are looking at the app. */
  | "location-foreground"
  /**
   * Where the listener is, with the screen off and the phone pocketed.
   *
   * The whole premise of walking mode (ADR-0010), and the hardest thing to be granted.
   */
  | "location-background"
  /** Compass heading, for the camera viewfinder. */
  | "orientation"
  /** Camera feed, for seeing echoes in the street. */
  | "camera"
  /** Telling someone an echo is near when the app is closed. */
  | "notifications"
  /** Vibration. Not a prompted permission on any platform, but it can be absent entirely. */
  | "haptics";

/** When it becomes reasonable to ask. */
export type AskMoment =
  /** Part of onboarding, with an explanation. Only ever for the one essential capability. */
  | "onboarding"
  /** The first time the listener starts a walk. */
  | "first-walk"
  /** The first time they pocket the phone, or start a hands-free walk. */
  | "first-hands-free"
  /** The first time they open the camera view. */
  | "first-viewfinder"
  /** After a successful capture, when the value is obvious and freshly demonstrated. */
  | "after-first-capture";

export interface CapabilityNeed {
  readonly capability: Capability;
  /** Without this, there is no product. True for exactly one capability. */
  readonly essential: boolean;
  readonly askAt: AskMoment;
  /** Shown in our own words, before the system prompt appears. */
  readonly rationale: string;
  /** What the listener loses by refusing. Honest, and never a threat. */
  readonly ifRefused: string;
}

/**
 * The full set, in the order they should ever be requested.
 *
 * Note what is absent: no microphone, no contacts, no photo library, no advertising
 * identifier. An app that asks for nothing it cannot justify is an app whose prompts get
 * granted.
 */
export const CAPABILITY_NEEDS: readonly CapabilityNeed[] = [
  {
    capability: "location-foreground",
    essential: true,
    askAt: "onboarding",
    rationale:
      "Echo Finders needs to know where you are to tell you what happened there. Nothing else works without it.",
    ifRefused: "Nothing can be found or captured. This is the one permission the app cannot do without.",
  },
  {
    capability: "haptics",
    essential: false,
    // Needs no prompt anywhere, but the walk should still behave correctly when the
    // device simply cannot vibrate. See ADR-0011.
    askAt: "first-walk",
    rationale: "Your phone buzzes faster as you get closer, so you can find an echo without looking.",
    ifRefused: "The map and the distance readout still lead you there; you just have to look at the screen.",
  },
  {
    capability: "location-background",
    essential: false,
    askAt: "first-hands-free",
    rationale:
      "So echoes can open with your phone in your pocket and the screen off, while you walk and listen.",
    ifRefused:
      "Echoes still open — you just need the app open on screen while you walk.",
  },
  {
    capability: "orientation",
    essential: false,
    askAt: "first-viewfinder",
    rationale: "So the camera view can show which echoes you are looking at.",
    ifRefused: "The camera view falls back to a list ordered by distance.",
  },
  {
    capability: "camera",
    essential: false,
    askAt: "first-viewfinder",
    rationale: "So you can hold up your phone and see the echoes around you in the street.",
    ifRefused: "Everything else works; you browse on the map instead.",
  },
  {
    capability: "notifications",
    essential: false,
    // Deliberately last, and only after someone has captured something and therefore
    // knows what a notification would even be for.
    askAt: "after-first-capture",
    rationale: "So we can tell you when you are passing something worth stopping for.",
    ifRefused: "You will find echoes while the app is open, as usual.",
  },
];

export type FeatureId =
  | "map-browsing"
  | "capture-on-screen"
  | "capture-hands-free"
  | "haptic-guidance"
  | "camera-viewfinder"
  | "passing-alerts";

export type FeatureLevel = "full" | "degraded" | "unavailable";

export interface FeatureState {
  readonly feature: FeatureId;
  readonly level: FeatureLevel;
  /** Empty when the feature is fully available. */
  readonly missing: readonly Capability[];
  /** What the listener can still do. Empty when unavailable. */
  readonly fallback: string;
}

interface FeatureSpec {
  readonly feature: FeatureId;
  readonly needs: readonly Capability[];
  /** Capabilities that improve it but are not required. */
  readonly enhancedBy?: readonly Capability[];
  readonly fallback: string;
}

const FEATURES: readonly FeatureSpec[] = [
  {
    feature: "map-browsing",
    needs: ["location-foreground"],
    fallback: "",
  },
  {
    feature: "capture-on-screen",
    needs: ["location-foreground"],
    fallback: "",
  },
  {
    feature: "capture-hands-free",
    needs: ["location-background"],
    enhancedBy: ["haptics"],
    fallback: "Keep the app on screen while you walk and echoes will still open.",
  },
  {
    feature: "haptic-guidance",
    needs: ["haptics"],
    fallback: "The map shows distance and direction instead.",
  },
  {
    feature: "camera-viewfinder",
    needs: ["camera", "orientation"],
    fallback: "A list of what is around you, nearest first.",
  },
  {
    feature: "passing-alerts",
    needs: ["notifications", "location-background"],
    fallback: "Open the app when you arrive somewhere and see what is nearby.",
  },
];

/**
 * What works, given what has been granted.
 *
 * The point of returning `degraded` rather than a bare boolean: almost nothing here is
 * all-or-nothing, and a UI that knows the difference can offer the fallback instead of an
 * error. "Keep the app on screen and this still works" is a very different message from
 * "walking mode unavailable".
 */
export function featureAvailability(granted: Iterable<Capability>): FeatureState[] {
  const have = new Set(granted);

  return FEATURES.map((spec) => {
    const missing = spec.needs.filter((c) => !have.has(c));
    const missingEnhancements = (spec.enhancedBy ?? []).filter((c) => !have.has(c));

    const level: FeatureLevel =
      missing.length > 0 ? "unavailable" : missingEnhancements.length > 0 ? "degraded" : "full";

    return {
      feature: spec.feature,
      level,
      missing: [...missing, ...missingEnhancements],
      fallback: level === "full" ? "" : spec.fallback,
    };
  });
}

/** True when the app can do its core job: find echoes and open them. */
export function isUsable(granted: Iterable<Capability>): boolean {
  return new Set(granted).has("location-foreground");
}

/** What to request at a given moment, skipping anything already granted. */
export function capabilitiesToRequest(
  moment: AskMoment,
  granted: Iterable<Capability>,
): CapabilityNeed[] {
  const have = new Set(granted);
  return CAPABILITY_NEEDS.filter(
    (need) => need.askAt === moment && !have.has(need.capability),
  );
}
