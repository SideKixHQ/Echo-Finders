import { describe, expect, it } from "vitest";
import { preflightGoLabel } from "../../apps/prototype/src/preflight-go";

describe("the journey screen's main button", () => {
  it("picking a flight says Find my route, for a returning listener too", () => {
    expect(preflightGoLabel({ roaming: false, travel: "flight", returning: true, choosing: false })).toBe("Find my route");
    expect(preflightGoLabel({ roaming: false, travel: "flight", returning: false, choosing: true })).toBe("Find my route");
  });

  it("a returning listener on the ground still carries on", () => {
    expect(preflightGoLabel({ roaming: false, travel: "walking", returning: true, choosing: false })).toBe("Carry on");
    expect(preflightGoLabel({ roaming: false, travel: "driving", returning: true, choosing: false })).toBe("Carry on");
  });

  it("choosing, or first time, finds a route", () => {
    expect(preflightGoLabel({ roaming: false, travel: "walking", returning: true, choosing: true })).toBe("Find my route");
    expect(preflightGoLabel({ roaming: false, travel: "walking", returning: false, choosing: true })).toBe("Find my route");
  });

  it("roaming starts looking, or driving", () => {
    expect(preflightGoLabel({ roaming: true, travel: "walking", returning: true, choosing: false })).toBe("Start looking");
    expect(preflightGoLabel({ roaming: true, travel: "driving", returning: false, choosing: true })).toBe("Start driving");
  });
});
