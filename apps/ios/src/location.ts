/**
 * Where the listener is, with "while using" permission only.
 *
 * `docs/ios-permissions.md`: on first use ask for When In Use, which the app is fully
 * usable with; Always is asked for later, the first time someone starts a hands free walk,
 * and never at launch. Phase 1 has no hands free walk, so it never asks for Always.
 *
 * It asks when the Map tab first needs a position, not at launch, and a refusal leaves the
 * map working: every echo is still on it, with a note offering to turn location on.
 */
import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import type { LatLng } from "@echofinders/core";

export type LocationState =
  | { readonly status: "asking" }
  | { readonly status: "denied"; readonly canAskAgain: boolean }
  | { readonly status: "unavailable" }
  | { readonly status: "located"; readonly at: LatLng; readonly accuracyM: number | null };

export function useWhileUsingLocation(): { state: LocationState; retry: () => void } {
  const [state, setState] = useState<LocationState>({ status: "asking" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (permission.status !== "granted") {
        setState({ status: "denied", canAskAgain: permission.canAskAgain });
        return;
      }
      // A walk's pace: an update every 25 m is plenty to reorder a nearest list.
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
        (position) => {
          setState({
            status: "located",
            at: { lat: position.coords.latitude, lng: position.coords.longitude },
            accuracyM: position.coords.accuracy,
          });
        },
        () => setState((prev) => (prev.status === "located" ? prev : { status: "unavailable" })),
      );
      if (cancelled) subscription.remove();
    })().catch(() => {
      if (!cancelled) setState({ status: "unavailable" });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [attempt]);

  return { state, retry };
}
