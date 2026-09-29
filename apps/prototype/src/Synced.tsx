/**
 * The moment.
 *
 * This is the one thing the product does that nothing else does: you stood in the right
 * place and a memory came into focus. Until now it was a pin quietly changing colour and a
 * row appearing in a list — a report rather than an event — and the app's own best moment
 * went past without being marked.
 *
 * So it takes the whole screen for two seconds. The world goes DARK rather than warm,
 * which is the proportion law at its most extreme and where it pays: one lit object on a
 * near-black screen is worth more than a whole warm screen ever was. The rings that were
 * rippling outward on the map collapse inward and land, which is the same metaphor running
 * backwards — the call has been answered.
 *
 * WHAT IT SAYS, and what it deliberately does not. The design put "you are the fourth
 * person to stand here" here, and that needs a backend counting syncs across everybody,
 * which does not exist. Rather than invent a number, it shows what is true and already
 * earned: the rarity tier and the reasons `rarityReasons` gives for it. "You have to find
 * the exact spot" is a fact about the world; "the fourth person" would be a fiction about
 * other people, and this screen is the last place in the product that should carry one.
 *
 * Both buttons are aqua, because both are things you press. Nothing you operate is ever
 * allowed to glow warm, or it competes with the thing you just earned.
 */

import { useEffect, useState } from "react";
import { rarityReasons, type CaptureEvent } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { EchoCharacter } from "./Echo";

const RARITY_LABEL: Record<string, string> = {
  common: "Synced",
  uncommon: "Uncommon",
  rare: "Rare",
  singular: "Singular",
};

export interface SyncedProps {
  readonly event: CaptureEvent;
  readonly onListen: () => void;
  readonly onLater: () => void;
}

export function Synced({ event, onListen, onLater }: SyncedProps) {
  const { echo, rarity } = event;
  const reasons = rarityReasons(echo);
  const minutes = Math.max(1, Math.round(echo.durationS / 60));

  /*
   * The morph runs once, shortly after it lands.
   *
   * 620ms of delay: the orb's own landing animation takes 420, and the eyes have to be
   * seen AS a pause before they can be seen turning into a play. Morphing immediately
   * just looks like the play button arriving late.
   */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 620);
    return () => clearTimeout(t);
  }, [echo.id]);

  return (
    /*
     * `role="dialog"` with a label, because this covers the map and takes the interaction.
     * Without it a screen reader lands in a changed page with no idea why.
     */
    <div className="synced" role="dialog" aria-modal="true" aria-label={`Synced: ${echo.title}`}>
      {/*
        Rings and echo share a wrapper so the rings are centred on the thing that landed
        rather than on a percentage of the viewport. They were anchored at 31% of the
        screen height, which is only the orb's centre on one phone.
      */}
      <div className="synced-orb">
        <div className="synced-rings" aria-hidden="true">
          <span className="synced-ring" />
          <span className="synced-ring synced-ring-2" />
          <span className="synced-ring synced-ring-3" />
        </div>

        {/*
          THE CREATURE, AND THE MORPH.

          It lands on this screen with its eyes still a pause button — because that is what
          it has been, sometimes for a century — and a beat later they swing together into
          a play triangle. Then it IS the button: pressing its face starts the story.

          That is why the old aqua "Listen now" button is gone from below rather than
          sitting next to this. The creature is the control, so this is one fewer thing on
          the screen instead of one more.

          EVERY echo gets the creature on THIS screen, not just the two rarities the map
          gives one to. The map's restraint is about crowding — nine faces on one screen is
          a crowd and a crowd has no standout. Here there is exactly one echo and nothing
          to compete with, so the rule that protects the map has nothing to protect.

          The aqua ring is the only part that says pressable, which keeps the colour law
          intact: the orb stays ember because it is the echo, and the ring around it is
          aqua because it is the interface. Colouring the triangle itself aqua would put a
          cold hole through the middle of the warmest object on the screen.
        */}
        <button
          className={armed ? "synced-press armed" : "synced-press"}
          onClick={onListen}
          aria-label={`Play: ${echo.title}`}
        >
          <svg viewBox="-60 -60 120 120" aria-hidden="true">
            <EchoCharacter face={armed ? "armed" : "calling"} r={47} uid="sync" />
          </svg>
        </button>
      </div>

      <div className="synced-say">
        <p className="synced-kicker">{RARITY_LABEL[rarity] ?? "Synced"}</p>
        <h2>{echo.title}</h2>
        <p className="synced-where">
          {echo.point.place} · {minutes} min
        </p>
      </div>

      {/*
        Only shown when the rarity was actually earned. A "common" echo with no reasons
        would get an empty panel saying nothing, which is worse than no panel.
      */}
      {reasons.length > 0 && (
        <div className="synced-rare">
          <p className="synced-rare-why">
            {reasons.map((r, i) => (
              <span key={r}>
                {i > 0 && <i aria-hidden="true"> · </i>}
                {r}
              </span>
            ))}
          </p>
          <p className="synced-rare-cat">{CATEGORY_LABEL[echo.category]}</p>
        </div>
      )}

      <div className="synced-acts">
        {/*
          One button now, and it is the quiet one. "Listen now" moved onto the creature's
          own face, so what is left here is the way out rather than a second way in.
        */}
        <button className="synced-later" onClick={onLater}>
          Keep it for later
        </button>
      </div>
    </div>
  );
}
