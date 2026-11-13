import { describe, expect, it } from "vitest";
import { buildRouteGeometry, distanceKm, pointAtDistance, type LatLng, type LocationSource, type Position, type Route } from "@echofinders/core";
import { FlightClock, TAKEOFF_KPH } from "../../apps/prototype/src/flight-clock";

const JFK = { lat: 40.6413, lng: -73.7781 };
const MIA = { lat: 25.7959, lng: -80.287 };
const JFK_MIA: Route = {
  id: "jfk-mia",
  mode: "flight",
  origin: { code: "JFK", name: "JFK", at: JFK, timeZone: "America/New_York" },
  destination: { code: "MIA", name: "MIA", at: MIA, timeZone: "America/New_York" },
  waypoints: [
    { name: "JFK", at: JFK },
    { name: "MIA", at: MIA },
  ],
  departureAt: "2026-06-15T14:00:00Z",
  durationS: 10_800,
};
const NOW = Date.parse("2026-11-13T15:00:00Z");
const NO_GPS: LocationSource = { watch: () => () => {} };
const fix = (at: LatLng, ms: number, extra: Partial<Position> = {}): Position => ({
  at,
  accuracyM: 10,
  timestamp: ms,
  source: "device-gnss",
  ...extra,
});
/** A point `km` south of `from`. */
const south = (from: LatLng, km: number): LatLng => ({ lat: from.lat - km / 111.195, lng: from.lng });

describe("a flight in real time (F1)", () => {
  it("waits at the gate until it takes off, however long that is", () => {
    let now = NOW;
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => now });
    now += 3 * 3600_000;
    expect(clock.takeoffAtMs).toBeNull();
    expect(distanceKm(clock.position().at, JFK)).toBeLessThan(0.5);
  });

  it("moves with the clock from takeoff, not in 210 seconds", () => {
    let now = NOW;
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => now });
    clock.tookOff(now);
    now += 210_000;
    // The demo would have landed. Three and a half minutes after takeoff a real flight is
    // still climbing out of New York.
    expect(clock.elapsedS()).toBeCloseTo(600 + 210, 0);
    expect(distanceKm(clock.position().at, JFK)).toBeLessThan(150);
    // And it lands when the route says it does: three hours from the gate.
    now = NOW + (10_800 - 600) * 1000;
    expect(distanceKm(clock.position().at, MIA)).toBeLessThan(1);
  });

  it("takes off when the phone says it is moving faster than a car", () => {
    let now = NOW;
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => now });
    clock.onGps(fix(JFK, now));
    clock.onGps(fix(south(JFK, 0.02), now + 1000)); // 72 km/h on the taxiway
    expect(clock.takeoffAtMs).toBeNull();
    clock.onGps(fix(south(JFK, 0.11), now + 2000)); // 324 km/h
    expect(TAKEOFF_KPH).toBe(250);
    expect(clock.takeoffAtMs).toBe(now + 2000);
  });

  it("uses the speed the phone reports where it gives one", () => {
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => NOW });
    clock.onGps(fix(JFK, NOW, { speedKph: 280 }));
    expect(clock.takeoffAtMs).toBe(NOW);
  });

  it("is not fooled by a parked phone's fix wandering", () => {
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => NOW });
    // 150 m in a second is 540 km/h, but both fixes are only good to 100 m.
    clock.onGps(fix(JFK, NOW, { accuracyM: 100 }));
    clock.onGps(fix(south(JFK, 0.15), NOW + 1000, { accuracyM: 100 }));
    expect(clock.takeoffAtMs).toBeNull();
  });
});

describe("the phone's GPS corrects the flight when it can be believed (F2, ADR-0002)", () => {
  /** A clock that took off at NOW, ten minutes ago by the time the window seat gets a fix. */
  function airborne() {
    let now = NOW;
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => now });
    clock.tookOff(now);
    now += 600_000;
    return { clock, at: (ms: number) => (now = ms), get now() { return now; } };
  }

  it("moves the flight to where a plausible fix says, and carries on from there", () => {
    const f = airborne();
    const reckoned = f.clock.km();
    // Further along than the clock thinks: a tailwind. Two fixes a minute apart at 900 km/h.
    const line = buildRouteGeometry(JFK_MIA);
    f.clock.onGps(fix(pointAtDistance(line, reckoned + 60), f.now));
    const second = pointAtDistance(line, reckoned + 75);
    f.clock.onGps(fix(second, f.now + 60_000));
    f.at(f.now + 60_000);
    expect(f.clock.km()).toBeGreaterThan(reckoned + 70);
    expect(distanceKm(f.clock.position().at, second)).toBeLessThan(1);
    // And the clock carries on from there: a minute later, about 14 km further.
    f.at(f.now + 60_000);
    expect(distanceKm(f.clock.position().at, second)).toBeGreaterThan(5);
  });

  it("ignores a fix outside the corridor: aircraft Wi-Fi placing the phone at a ground station", () => {
    const f = airborne();
    const reckoned = f.clock.km();
    const station = { lat: 39.74, lng: -104.99 }; // Denver
    f.clock.onGps(fix(station, f.now));
    f.clock.onGps(fix(station, f.now + 60_000));
    f.at(f.now + 60_000);
    expect(Math.abs(f.clock.km() - reckoned - (60 * 850) / 3600)).toBeLessThan(5);
  });

  it("ignores a fix no aircraft could have flown to", () => {
    const f = airborne();
    const reckoned = f.clock.km();
    f.clock.onGps(fix(south(JFK, reckoned), f.now));
    // 1,000 km in a minute.
    f.clock.onGps(fix(south(JFK, reckoned + 1000), f.now + 60_000));
    f.at(f.now + 60_000);
    expect(f.clock.km()).toBeLessThan(reckoned + 100);
  });

  it("does not let GPS move the plane before takeoff", () => {
    let now = NOW;
    const clock = new FlightClock(JFK_MIA, NO_GPS, { now: () => now });
    clock.onGps(fix(JFK, now));
    clock.onGps(fix(south(JFK, 0.01), now + 1000));
    now += 1000;
    expect(clock.km()).toBe(0);
  });
});
