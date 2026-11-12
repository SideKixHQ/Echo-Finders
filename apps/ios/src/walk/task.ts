/**
 * The walk's location: the background task that hears the phone move with the screen
 * locked, and the on screen watch that stands in for it when Always was refused.
 *
 * Both feed one `WalkJudge` (`logic.ts`), which runs the engine's arrival rules, and hand
 * what it decides to the narrator: `offer(echo)` for each echo reached, then `moved(at)`.
 * The narrator plays one, queues two, and drops a waiting echo once you have walked on.
 *
 * `TaskManager.defineTask` runs when this module loads, at the top of the root layout
 * (`app/_layout.tsx`), because iOS can deliver a background update before any screen has
 * mounted. Until the narrator has attached itself (`attachNarrator`) updates are left
 * alone, so an echo is never marked found without being offered.
 *
 * Location goes nowhere but here. Fixes are read in memory, compared with the echoes
 * already on the phone, and dropped; what is kept on disk is which echoes were found and
 * when, never where you stood (`walk.json`, privacy defaults applied).
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Directory, File, Paths } from "expo-file-system";
import type { Deferred, Echo, LatLng } from "@echofinders/core";
import { ECHOES } from "../library";
import { WALKING_UPDATES, WalkJudge, parseRecords, type Fix } from "./logic";

/** The background location task's name, as registered with iOS. */
export const WALK_TASK = "echo-finders-walk";

/** The narrator's two calls a walk makes (`player.tsx`). */
export interface WalkHands {
  readonly offer: (echo: Echo) => Deferred | null;
  readonly moved: (at: LatLng) => readonly Deferred[];
}

let hands: WalkHands | null = null;
let judge: WalkJudge | null = null;
let onScreen: Location.LocationSubscription | null = null;

/** The narrator, while the app is running. Returns how to let go. */
export function attachNarrator(next: WalkHands): () => void {
  hands = next;
  return () => {
    if (hands === next) hands = null;
  };
}

function theJudge(): WalkJudge {
  judge ??= new WalkJudge(ECHOES, readFound());
  return judge;
}

/** Run fixes through the engine, and hand the narrator what they decide. */
function feed(fixes: readonly Fix[]): void {
  const narrator = hands;
  if (!narrator || fixes.length === 0) return;
  let found = false;
  for (const step of theJudge().update(fixes)) {
    for (const echo of step.offer) narrator.offer(echo);
    narrator.moved(step.at);
    if (step.found.length > 0) found = true;
  }
  if (found) writeFound(theJudge());
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(WALK_TASK, async ({ data, error }) => {
  // An error here is iOS saying it could not get a fix this time; the next one carries on.
  if (error || !data?.locations) return;
  feed(data.locations);
});

/** `WALKING_UPDATES` as expo-location takes them. */
const UPDATES: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  distanceInterval: WALKING_UPDATES.distanceIntervalM,
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: WALKING_UPDATES.pausesUpdatesAutomatically,
  showsBackgroundLocationIndicator: WALKING_UPDATES.showsBackgroundLocationIndicator,
};

/**
 * Walk hands free: location updates that carry on with the screen locked. Needs Always.
 * Calling it again while the walk is on re-arms it, which wakes updates iOS paused.
 */
export async function startHandsFree(): Promise<void> {
  stopOnScreen();
  await Location.startLocationUpdatesAsync(WALK_TASK, UPDATES);
}

/** Walk with the app on screen: the same judge, fed only while the app is in front. */
export async function startOnScreen(): Promise<void> {
  if (onScreen) return;
  const subscription = await Location.watchPositionAsync(
    { accuracy: UPDATES.accuracy, distanceInterval: UPDATES.distanceInterval },
    (fix) => feed([fix]),
  );
  if (onScreen) subscription.remove();
  else onScreen = subscription;
}

function stopOnScreen(): void {
  onScreen?.remove();
  onScreen = null;
}

/** Is a hands free walk running? It outlives the screen that started it, and a relaunch. */
export async function isHandsFreeOn(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(WALK_TASK);
  } catch {
    return false;
  }
}

/** End the walk, either kind. Background updates stop here. */
export async function stopWalk(): Promise<void> {
  stopOnScreen();
  if (await isHandsFreeOn()) await Location.stopLocationUpdatesAsync(WALK_TASK);
}

// --- What is kept -----------------------------------------------------------------------------

const prefs = () => new Directory(Paths.document, "prefs");
const foundFile = () => new File(prefs(), "walk.json");

function readFound() {
  try {
    const file = foundFile();
    return file.exists ? parseRecords(JSON.parse(file.textSync()) as unknown) : [];
  } catch {
    return [];
  }
}

function writeFound(from: WalkJudge): void {
  try {
    const folder = prefs();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    // Written beside and moved into place, so a crash mid write never leaves half a file.
    const tmp = new File(folder, "walk.json.tmp");
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.writeSync(JSON.stringify({ found: from.records }));
    tmp.moveSync(foundFile(), { overwrite: true });
  } catch {
    /* Found echoes are still remembered until the app closes. */
  }
}
