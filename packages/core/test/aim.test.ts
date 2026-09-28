import { describe, expect, it } from "vitest";
import {
  aimWords,
  compassWords,
  relativeBearing,
  walkDistance,
  willPlayOnArrival,
} from "../src/index.js";

describe("relative bearing", () => {
  it("is the bearing minus the heading, wrapped into a circle", () => {
    expect(relativeBearing(90, 0)).toBe(90);
    expect(relativeBearing(0, 90)).toBe(270);
    expect(relativeBearing(350, 10)).toBe(340);
    expect(relativeBearing(10, 350)).toBe(20);
  });

  it("never returns a negative angle, whatever it is handed", () => {
    for (let b = -720; b <= 720; b += 37) {
      for (let h = -720; h <= 720; h += 53) {
        const r = relativeBearing(b, h);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(360);
      }
    }
  });
});

describe("aim words", () => {
  it("says ahead only when it is nearly ahead", () => {
    expect(aimWords(0)).toBe("Straight ahead");
    expect(aimWords(14)).toBe("Straight ahead");
    expect(aimWords(346)).toBe("Straight ahead");
    expect(aimWords(15)).not.toBe("Straight ahead");
  });

  it("picks the side the walker would actually turn", () => {
    expect(aimWords(30)).toBe("Ahead and slightly right");
    expect(aimWords(330)).toBe("Ahead and slightly left");
    expect(aimWords(80)).toBe("To your right");
    expect(aimWords(280)).toBe("To your left");
    expect(aimWords(130)).toBe("Behind you, to the right");
    expect(aimWords(230)).toBe("Behind you, to the left");
  });

  it("stops naming a side once the only instruction is turn round", () => {
    expect(aimWords(180)).toBe("Turn around");
    expect(aimWords(170)).toBe("Turn around");
    expect(aimWords(190)).toBe("Turn around");
  });

  it("is symmetric: every left has a mirrored right", () => {
    for (let d = 1; d < 180; d += 1) {
      const right = aimWords(d);
      const left = aimWords(360 - d);
      expect(left).toBe(right.replace(/right/, "left"));
    }
  });

  it("gives an answer for every angle, including ones out of range", () => {
    for (let d = -400; d <= 760; d += 1) {
      expect(aimWords(d).length).toBeGreaterThan(0);
    }
  });
});

describe("walk distance", () => {
  it("stops counting once you are on it", () => {
    expect(walkDistance(0.0)).toEqual({ value: "Here", unit: "" });
    expect(walkDistance(0.024)).toEqual({ value: "Here", unit: "" });
  });

  it("rounds coarser the further away it is, because that is where the precision is", () => {
    expect(walkDistance(0.153)).toEqual({ value: "155", unit: "m" });
    expect(walkDistance(0.457)).toEqual({ value: "460", unit: "m" });
    expect(walkDistance(2.34)).toEqual({ value: "2.3", unit: "km" });
    expect(walkDistance(14.6)).toEqual({ value: "15", unit: "km" });
  });

  it("never renders more than four characters, which is what the 76px type allows", () => {
    for (let km = 0; km < 200; km += 0.013) {
      expect(walkDistance(km).value.length).toBeLessThanOrEqual(4);
    }
  });
});

const render = { voiceId: "v1", audioKey: "a", durationS: 100 } as const;

describe("will it play by itself", () => {
  it("does not promise anything when auto-play is off", () => {
    expect(
      willPlayOnArrival({ autoPlay: false, echo: { id: "e", renders: [render] } }),
    ).toBe(false);
  });

  it("promises when auto-play is on and nothing narrows it", () => {
    expect(willPlayOnArrival({ autoPlay: true, echo: { id: "e", renders: [render] } })).toBe(
      true,
    );
  });

  it("keeps quiet about one the listener did not choose", () => {
    expect(
      willPlayOnArrival({
        autoPlay: true,
        autoPlayOnly: ["other"],
        echo: { id: "e", renders: [render] },
      }),
    ).toBe(false);
  });

  it("treats an empty choice as a choice, not as no restriction", () => {
    expect(
      willPlayOnArrival({ autoPlay: true, autoPlayOnly: [], echo: { id: "e", renders: [render] } }),
    ).toBe(false);
  });

  /*
   * The one the design board could not have known about. Most of the library has no audio
   * rendered yet, and an echo with no render is silent on arrival whatever the switches
   * say. Promising otherwise would be the screen lying about the commonest case we have.
   */
  it("does not promise audio that does not exist", () => {
    expect(willPlayOnArrival({ autoPlay: true, echo: { id: "e" } })).toBe(false);
    expect(willPlayOnArrival({ autoPlay: true, echo: { id: "e", renders: [] } })).toBe(false);
  });
});

describe("compass words", () => {
  it("centres each name on its own bearing rather than starting at it", () => {
    expect(compassWords(0)).toBe("north");
    expect(compassWords(22)).toBe("north");
    expect(compassWords(23)).toBe("north-east");
    expect(compassWords(338)).toBe("north");
    expect(compassWords(337)).toBe("north-west");
  });

  it("names all eight, and only those eight", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 360; d += 1) seen.add(compassWords(d));
    expect([...seen].sort()).toEqual([
      "east",
      "north",
      "north-east",
      "north-west",
      "south",
      "south-east",
      "south-west",
      "west",
    ]);
  });

  it("answers for angles outside a single turn", () => {
    expect(compassWords(360)).toBe("north");
    expect(compassWords(-90)).toBe("west");
    expect(compassWords(725)).toBe("north");
  });
});
