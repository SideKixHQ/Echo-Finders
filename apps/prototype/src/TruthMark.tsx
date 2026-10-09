/**
 * True story, not yet verified, disputed, or legend: the same mark on every screen.
 *
 * James (2026-10-09): ghost stories, folklore and local myths are not factual; history,
 * people, the arts and true crime are, and should be verified. "Mark appropriately so the
 * user knows just by looking." The card, the player and My Echoes each carry this, so a
 * ghost story never looks like a court record anywhere it appears.
 *
 * "Verified" is what a person really checked, as authored (`VERIFIED_IDS`), never the demo
 * library's overridden status, which marks everything approved so that it plays.
 */

import { truthOf, TRUTH_LABEL, type Echo } from "@echofinders/core";
import { VERIFIED_IDS } from "./library.generated";

export function truthFor(echo: Echo) {
  return truthOf(echo, VERIFIED_IDS.has(echo.id));
}

export function TruthMark({ echo, short = false }: { readonly echo: Echo; readonly short?: boolean }) {
  const truth = truthFor(echo);
  const label = TRUTH_LABEL[truth];
  return (
    <span className={`truth truth-${truth}`} title={label.full}>
      {truth === "true-story" && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 L10 17.5 L19 7" />
        </svg>
      )}
      {short ? label.short : label.full}
    </span>
  );
}
