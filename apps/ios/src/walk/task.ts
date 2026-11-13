/**
 * The walk's location: the background task that hears the phone move with the screen
 * locked, during a hands free walk.
 *
 * The app shows the web app (ADR-0012, amended 2026-11-13), and the web app decides what a
 * fix means. So the task decides nothing: it hands every fix to whoever is attached
 * (`attachFixes`, the app's shell, `shell/WebShell.tsx`), which passes them to the page, or
 * keeps them while the page cannot run and lets the pocket judge (`shell/logic.ts`) start
 * what the page said would play.
 *
 * `TaskManager.defineTask` runs when this module loads, at the top of the root layout
 * (`app/_layout.tsx`), because iOS can deliver a background update before any screen has
 * mounted. Fixes that arrive before the shell has attached are held for it.
 *
 * Location goes nowhere but the page on this phone. Nothing here writes a fix down.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { WALKING_UPDATES } from "./logic";

/** The background location task's name, as registered with iOS. */
export const WALK_TASK = "echo-finders-walk";

type FixSink = (fixes: readonly Location.LocationObject[]) => void;

let sink: FixSink | null = null;
/** Fixes that came before the shell was ready, oldest first, a few hundred at most. */
let early: Location.LocationObject[] = [];
const MAX_EARLY = 500;

/** The shell, while the app is running. Returns how to let go. */
export function attachFixes(next: FixSink): () => void {
  sink = next;
  if (early.length > 0) {
    const held = early;
    early = [];
    next(held);
  }
  return () => {
    if (sink === next) sink = null;
  };
}

function feed(fixes: readonly Location.LocationObject[]): void {
  if (fixes.length === 0) return;
  if (sink) return sink(fixes);
  early = [...early, ...fixes].slice(-MAX_EARLY);
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
  await Location.startLocationUpdatesAsync(WALK_TASK, UPDATES);
}

/**
 * Walk with the app on screen. The page's own location (the shell's watch) is already
 * running while the app is on screen, so this needs no watch of its own; the walk only
 * keeps the screen awake (`WalkProvider.tsx`).
 */
export async function startOnScreen(): Promise<void> {
  /* Nothing to start. */
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
  if (await isHandsFreeOn()) await Location.stopLocationUpdatesAsync(WALK_TASK);
}
