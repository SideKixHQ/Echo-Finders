/**
 * The camera and the compass, both of which are frequently absent.
 *
 * Kept together because they fail the same way and the interface has to survive both: a
 * desktop browser has neither, iOS will not give you the compass without a gesture, and
 * Android gives you one whose accuracy it declines to state. The engine already treats all
 * of that as normal — `alignmentTo` takes `headingDeg: number | null` and still answers —
 * so the job here is only to report honestly which of the two we actually got.
 *
 * Nothing here asks for permission on mount. A viewfinder that turns the camera on because
 * a component rendered is the behaviour that makes people uninstall things; the camera
 * starts when somebody opens the viewfinder and stops the moment they leave it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "live"; readonly stream: MediaStream }
  /** Refused, unsupported, or no camera at all — all the same to the interface. */
  | { readonly kind: "unavailable"; readonly why: string };

export function useCamera() {
  const [state, setState] = useState<CameraState>({ kind: "idle" });
  const streamRef = useRef<MediaStream | null>(null);
  // Guards the gap between asking for the camera and being given it: leave the viewfinder
  // inside that window and the stream arrives with nothing to stop it, so the indicator
  // light stays on. Tracked as a count so a stop/start pair cannot resurrect a dead grant.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ kind: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    const mine = ++generation.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "unavailable", why: "This browser has no camera access" });
      return;
    }
    setState({ kind: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // `environment` is a hint, not a guarantee — a laptop has only a front camera and
        // will hand one over anyway, which is the right outcome for a demo.
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (mine !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setState({ kind: "live", stream });
    } catch (error) {
      if (mine !== generation.current) return;
      const why =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera access was declined"
          : "No camera available here";
      setState({ kind: "unavailable", why });
    }
  }, []);

  // Belt and braces: a stream outliving its component is a light that stays on.
  useEffect(() => () => void streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { state, start, stop };
}

export interface Heading {
  /** Degrees clockwise from true north, or null when the device will not say. */
  readonly deg: number | null;
  /** How wrong it may be. Assume a lot until told otherwise. */
  readonly accuracyDeg: number;
  /** Whether a permission prompt is still owed, as it is on iOS. */
  readonly needsPermission: boolean;
}

type OrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * Which way the phone is pointing.
 *
 * `webkitCompassHeading` is Safari's, already true-north corrected and already clockwise.
 * Everyone else gives `alpha`, which is anticlockwise from an origin that is only magnetic
 * north when `absolute` is set — so a non-absolute reading is reported with a large stated
 * error rather than passed off as a compass. `alignmentTo` refuses to advise on facing at
 * 45° or worse, which is exactly the right answer for a phone that is guessing.
 */
export function useHeading(active: boolean): Heading & { ask: () => Promise<void> } {
  const [deg, setDeg] = useState<number | null>(null);
  const [accuracyDeg, setAccuracy] = useState(90);
  const [granted, setGranted] = useState(false);

  const supported =
    typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined";
  const gated =
    supported &&
    typeof (window.DeviceOrientationEvent as OrientationEventCtor).requestPermission === "function";

  const ask = useCallback(async () => {
    if (!gated) {
      setGranted(true);
      return;
    }
    try {
      const request = (window.DeviceOrientationEvent as OrientationEventCtor).requestPermission;
      setGranted((await request?.()) === "granted");
    } catch {
      setGranted(false);
    }
  }, [gated]);

  useEffect(() => {
    if (!active || !supported) return;
    if (gated && !granted) return;

    const onOrientation = (event: DeviceOrientationEvent) => {
      const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      const accuracy = (event as DeviceOrientationEvent & { webkitCompassAccuracy?: number })
        .webkitCompassAccuracy;
      if (typeof webkit === "number" && !Number.isNaN(webkit)) {
        setDeg(norm(webkit));
        // Safari reports −1 when it has no fix yet, which is a refusal, not an accuracy.
        setAccuracy(typeof accuracy === "number" && accuracy >= 0 ? Math.max(8, accuracy) : 15);
        return;
      }
      if (typeof event.alpha === "number" && !Number.isNaN(event.alpha)) {
        setDeg(norm(360 - event.alpha));
        // A relative reading has an unknown origin, so it is only good for "did I turn",
        // never for "which way is that building". Say so in the number.
        setAccuracy(event.absolute ? 20 : 90);
      }
    };

    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [active, supported, gated, granted]);

  return { deg, accuracyDeg, needsPermission: gated && !granted, ask };
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;
