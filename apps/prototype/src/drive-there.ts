/**
 * Drive there: hand the drive to the phone's own maps app.
 *
 * James (2026-10-15): driving directions belong to Apple Maps and Google Maps, not to us.
 * They have traffic, lanes and rerouting, drivers already trust them, and the less there is
 * to read on our screen while moving, the better (`docs/10-blockers.md` #14). Echo Finders
 * keeps playing while their maps app drives.
 *
 * Apple Maps on Apple devices, Google Maps everywhere else. Both are plain web links that
 * the phone opens in its maps app, so there is no key, no account and nothing to load. The
 * destination is sent to Apple or Google only when somebody taps the button.
 */

import type { LatLng } from "@echofinders/core";

const appleDevice = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ||
    // iPadOS asks for desktop pages and calls itself a Mac; it is the one with a touchscreen.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function driveThereUrl(at: LatLng, label?: string): string {
  const where = `${at.lat.toFixed(6)},${at.lng.toFixed(6)}`;
  if (appleDevice()) {
    const q = label ? `&q=${encodeURIComponent(label)}` : "";
    return `https://maps.apple.com/?daddr=${where}&dirflg=d${q}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${where}&travelmode=driving`;
}
