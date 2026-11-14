/**
 * What the journey screen's main button says (`Preflight.tsx`).
 *
 * "Carry on" is for a returning listener going back to the journey they were on: the
 * screen shows what they have and offers the way back to it. A flight is never that. It is
 * chosen by its two airports on this screen every time (Flying clears the route, App.tsx),
 * so pressing the button is starting a new journey, and "Carry on" read as though the
 * pick had been ignored (James, 2026-11-13: on a flight it says "Find my route").
 */
export function preflightGoLabel({
  roaming,
  travel,
  returning,
  choosing,
}: {
  readonly roaming: boolean;
  readonly travel: "walking" | "driving" | "flight";
  readonly returning: boolean;
  readonly choosing: boolean;
}): string {
  if (roaming) return travel === "driving" ? "Start driving" : "Start looking";
  if (returning && !choosing && travel !== "flight") return "Carry on";
  return "Find my route";
}
