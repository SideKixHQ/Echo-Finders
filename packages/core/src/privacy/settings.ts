/**
 * What the app remembers about a person, and their control over it.
 *
 * The central distinction, and it is the one most apps get wrong: **a collection is not a
 * location history.**
 *
 * "I captured the Federal Hall echo on 14 June" is a record about an echo. The echo's
 * coordinates are public knowledge — they are in the content library, shipped to everyone.
 * Storing that someone found it reveals almost nothing.
 *
 * "I was at 40.70691, −74.01128 at 14:32:07 on 14 June, accurate to four metres" is a
 * record about a *person*. It is where they stood, to within a few paces, at a known
 * moment. Accumulated over a year it is a map of someone's life.
 *
 * Both were previously stored together, because it was convenient. They are separated here
 * so the second can be off by default while the first — the part that makes the product
 * worth returning to — carries on working.
 */

import type { CaptureRecord } from "../capture/types.js";

export interface PrivacySettings {
  /**
   * Let echoes open with the screen off and the phone pocketed.
   *
   * Needs background location. Off until asked for, because it is the permission that most
   * deserves a deliberate choice.
   */
  readonly handsFree: boolean;

  /**
   * Keep a collection at all.
   *
   * On by default: it is what capture means, and turning it off means arriving somewhere
   * and having nothing to show for it afterwards.
   */
  readonly keepCollection: boolean;

  /**
   * Also record the exact spot the listener stood, rather than only which echo opened and
   * when.
   *
   * **Off by default.** This is the part that is about the person rather than the place.
   * Worth having — it is what turns a collection into a personal map — but it is a choice
   * somebody should make on purpose, not one they discover having already made.
   */
  readonly recordPrecisePlaces: boolean;

  /** Anonymous usage statistics. Opt-in, like everything that is for our benefit. */
  readonly analytics: boolean;

  /** Let sponsorship be chosen by where the listener is, rather than shown to everyone. */
  readonly personalisedSponsorship: boolean;
}

/**
 * Defaults.
 *
 * Every setting that serves us rather than the listener starts off. Every setting that
 * takes something extra about them starts off. What remains on is the minimum for the
 * product to be itself.
 */
export const PRIVACY_DEFAULTS: PrivacySettings = {
  handsFree: false,
  keepCollection: true,
  recordPrecisePlaces: false,
  analytics: false,
  personalisedSponsorship: false,
};

/**
 * Strip a capture record down to what the settings permit.
 *
 * Applied at the moment of writing, never at the moment of reading. Data that was never
 * stored cannot leak, cannot be subpoenaed, and cannot be forgotten about in a backup —
 * which is a stronger guarantee than any access rule over data we did keep.
 */
export function redactRecord(
  record: CaptureRecord,
  settings: PrivacySettings,
): CaptureRecord | null {
  if (!settings.keepCollection) return null;
  if (settings.recordPrecisePlaces) return record;

  // Keep which echo, and when. Drop where the person was.
  // Which echo, and when. Not where the person was.
  //
  // Omitted rather than blanked. An earlier version wrote `NaN` into both fields as a
  // sentinel, and its comment described substituting the echo's own coordinates — which is
  // neither what it did nor a good idea, since inventing a position is a worse answer than
  // admitting there isn't one. Leaving the fields out is the only version that survives
  // being written to a disk, sent to an API, or read by code that forgot to check.
  const { echoId, capturedAt, heardAt } = record;
  return {
    echoId,
    capturedAt,
    ...(heardAt ? { heardAt } : {}),
  };
}

/** True when this record carries a person's own position rather than only an echo id. */
export function holdsPersonalLocation(record: CaptureRecord): boolean {
  return record.stoodAt !== undefined;
}

export type DeletionScope =
  /** Remove the standing positions, keep which echoes were found and when. */
  | "precise-places"
  /** Remove the collection entirely. */
  | "collection";

export interface DeletionResult {
  readonly records: readonly CaptureRecord[];
  readonly removed: number;
  /** Records still holding a personal position afterwards. Must be zero for either scope. */
  readonly personalLocationsRemaining: number;
}

/**
 * Delete, honestly.
 *
 * "Delete my history" has to mean the data is gone, not hidden. `personalLocationsRemaining`
 * exists so a test can assert that rather than trusting the implementation, because this is
 * exactly the promise that quietly rots as a codebase grows.
 */
export function deleteData(
  records: readonly CaptureRecord[],
  scope: DeletionScope,
): DeletionResult {
  if (scope === "collection") {
    return { records: [], removed: records.length, personalLocationsRemaining: 0 };
  }

  const stripped = records.map((record) =>
    redactRecord(record, { ...PRIVACY_DEFAULTS, recordPrecisePlaces: false })!,
  );

  return {
    records: stripped,
    removed: records.filter(holdsPersonalLocation).length,
    personalLocationsRemaining: stripped.filter(holdsPersonalLocation).length,
  };
}

export interface CollectionExport {
  readonly format: "echofinders.collection.v1";
  readonly exportedAt: string;
  readonly records: readonly CaptureRecord[];
}

/**
 * Everything held about a listener, in a form they can read and keep.
 *
 * Plain JSON rather than a proprietary archive, because a right to your data that requires
 * our app to read it is not much of a right.
 */
export function exportCollection(
  records: readonly CaptureRecord[],
  atMs: number = Date.now(),
): CollectionExport {
  return {
    format: "echofinders.collection.v1",
    exportedAt: new Date(atMs).toISOString(),
    records: [...records],
  };
}

/**
 * Which capabilities these settings actually call for.
 *
 * Keeps the permission prompts honest: an app that asks for background location while
 * hands-free mode is switched off is asking for something it has no use for, and people
 * are right to notice.
 */
export function capabilitiesImpliedBy(settings: PrivacySettings): Set<string> {
  const needed = new Set<string>(["location-foreground"]);
  if (settings.handsFree) {
    needed.add("location-background");
    needed.add("notifications");
  }
  return needed;
}
