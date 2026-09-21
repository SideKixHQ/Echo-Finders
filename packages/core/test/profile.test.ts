import { describe, expect, it } from "vitest";
import { JourneyProfile, positionAtTime } from "../src/route/profile.js";
import { buildRouteGeometry } from "../src/geo/corridor.js";
import { distanceKm } from "../src/geo/great-circle.js";
import { isDaylight, localSolarHour, solarElevationDeg } from "../src/geo/solar.js";
import { JFK_MIA } from "./fixtures.js";

const THREE_HOURS = 10_800;
const TOTAL_KM = 1800;

describe("JourneyProfile", () => {
  const profile = new JourneyProfile(THREE_HOURS, TOTAL_KM);

  it("starts at the origin and ends at the destination", () => {
    expect(profile.distanceAtTime(0)).toBe(0);
    expect(profile.distanceAtTime(THREE_HOURS)).toBeCloseTo(TOTAL_KM, 6);
  });

  it("clamps outside the flight", () => {
    expect(profile.distanceAtTime(-500)).toBe(0);
    expect(profile.distanceAtTime(THREE_HOURS + 5000)).toBe(TOTAL_KM);
  });

  it("never goes backwards", () => {
    let previous = -1;
    for (let t = 0; t <= THREE_HOURS; t += 30) {
      const km = profile.distanceAtTime(t);
      expect(km).toBeGreaterThanOrEqual(previous);
      previous = km;
    }
  });

  it("inverts cleanly, so scheduling by distance and by time agree", () => {
    for (let km = 0; km <= TOTAL_KM; km += 25) {
      const t = profile.timeAtDistance(km);
      expect(profile.distanceAtTime(t)).toBeCloseTo(km, 1);
    }
  });

  it("barely moves during taxi", () => {
    // The whole point of modelling phases: ten minutes in, a constant-speed model would
    // have us 100km down the track and cueing a story about the wrong city.
    expect(profile.distanceAtTime(600)).toBeLessThan(25);
  });

  it("covers most of the route during cruise", () => {
    const climbEnd = profile.distanceAtTime(1500);
    const descentStart = profile.distanceAtTime(THREE_HOURS - 1500);
    expect(descentStart - climbEnd).toBeGreaterThan(TOTAL_KM * 0.6);
  });

  it("reports phases in order", () => {
    expect(profile.phaseAtTime(0)).toBe("not-started");
    expect(profile.phaseAtTime(1200)).toBe("settling");
    expect(profile.phaseAtTime(THREE_HOURS / 2)).toBe("underway");
    expect(profile.phaseAtTime(THREE_HOURS - 700)).toBe("arriving");
    expect(profile.phaseAtTime(THREE_HOURS + 1)).toBe("arrived");
  });

  it("opens a listening window inside the flight, clear of both ends", () => {
    const window = profile.listeningWindow();
    expect(window.startS).toBeGreaterThan(600);
    expect(window.endS).toBeLessThan(THREE_HOURS);
    expect(window.endS - window.startS).toBeGreaterThan(THREE_HOURS * 0.5);
  });

  it("squeezes the fixed phases so a short hop still has cruise", () => {
    const hop = new JourneyProfile(2400, 400); // 40 minutes
    const window = hop.listeningWindow();
    expect(window.endS).toBeGreaterThan(window.startS);
    expect(hop.distanceAtTime(2400)).toBeCloseTo(400, 6);
  });

  it("rejects impossible flights", () => {
    expect(() => new JourneyProfile(0, 100)).toThrow(/duration/);
    expect(() => new JourneyProfile(100, 0)).toThrow(/distance/);
  });
});

describe("positionAtTime", () => {
  const geometry = buildRouteGeometry(JFK_MIA);
  const profile = JourneyProfile.forJourney(JFK_MIA, geometry);
  const departure = Date.parse(JFK_MIA.departureAt);

  it("starts at JFK and ends at MIA", () => {
    const start = positionAtTime(geometry, profile, 0, departure);
    const end = positionAtTime(geometry, profile, JFK_MIA.durationS, departure);
    expect(distanceKm(start.at, JFK_MIA.origin.at)).toBeLessThan(1);
    expect(distanceKm(end.at, JFK_MIA.destination.at)).toBeLessThan(1);
  });

  it("is labelled dead-reckoned, the floor of ADR-0002", () => {
    expect(positionAtTime(geometry, profile, 3000, departure).source).toBe("dead-reckoned");
  });

  it("heads broadly south down the east coast", () => {
    const heading = positionAtTime(geometry, profile, 5400, departure).headingDeg!;
    expect(heading).toBeGreaterThan(150);
    expect(heading).toBeLessThan(230);
  });

  it("advances the wall clock with the flight", () => {
    const later = positionAtTime(geometry, profile, 3600, departure);
    expect(later.timestamp).toBe(departure + 3_600_000);
  });
});

describe("solar position", () => {
  it("puts the sun high over the equator at local noon", () => {
    // 2026-03-20 is near the equinox; 12:00 UTC at longitude 0 is local solar noon.
    const elevation = solarElevationDeg({ lat: 0, lng: 0 }, Date.parse("2026-03-20T12:00:00Z"));
    expect(elevation).toBeGreaterThan(80);
  });

  it("puts the sun below the horizon on the opposite side of the world", () => {
    const elevation = solarElevationDeg({ lat: 0, lng: 180 }, Date.parse("2026-03-20T12:00:00Z"));
    expect(elevation).toBeLessThan(-80);
  });

  it("knows the Arctic is lit around the clock in midsummer", () => {
    const midnight = Date.parse("2026-06-21T00:00:00Z");
    expect(isDaylight({ lat: 78, lng: 15 }, midnight)).toBe(true);
  });

  it("knows Miami is dark at 3am local", () => {
    // Miami is UTC-4 in June, so 07:00 UTC is 03:00 local.
    expect(isDaylight({ lat: 25.79, lng: -80.29 }, Date.parse("2026-06-15T07:00:00Z"))).toBe(false);
  });

  it("derives a plausible local solar hour from longitude", () => {
    const hour = localSolarHour({ lat: 0, lng: -75 }, Date.parse("2026-06-15T17:00:00Z"));
    expect(hour).toBeCloseTo(12, 0);
  });
});
