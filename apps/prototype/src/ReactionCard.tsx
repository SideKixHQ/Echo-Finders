/**
 * "How did it land?", as an echo finishes.
 *
 * James (2026-10-09) wanted ratings "in a cool way, not just a thumbs up or down", and
 * chose four faces: Whoa, Chills, Ha, Moved. Each means "more like this" in a different
 * way, which is what the next echo needs to know (`reactions.ts`). "Meh" is there, small,
 * because "not for me" is worth knowing too, and it is never the first thing offered.
 *
 * A card at the bottom, not a screen: the story is over and the walk is not. One tap
 * answers and closes it; ✕ or simply walking on skips it. It asks once per echo.
 */
import { FACES, REACTION_LABEL, type Echo, type Reaction } from "@echofinders/core";

const FACE_EMOJI: Record<Reaction, string> = { whoa: "😮", chills: "🥶", ha: "😂", moved: "🥹", meh: "😐" };
export const faceOf = (r: Reaction) => FACE_EMOJI[r];

export function ReactionCard({
  echo,
  onReact,
  onSkip,
}: {
  readonly echo: Echo;
  readonly onReact: (r: Reaction) => void;
  readonly onSkip: () => void;
}) {
  return (
    <div className="react" role="dialog" aria-label={`How did ${echo.title} land?`}>
      <button className="react-skip" onClick={onSkip} aria-label="Skip">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <p className="react-ask mono">How did it land?</p>
      <p className="react-title">{echo.title}</p>
      <div className="react-faces" role="group" aria-label="Your reaction">
        {FACES.map((f) => (
          <button key={f} className={`react-face react-${f}`} onClick={() => onReact(f)} aria-label={`${REACTION_LABEL[f].word}: ${REACTION_LABEL[f].says}`}>
            <span className="react-emoji" aria-hidden="true">{FACE_EMOJI[f]}</span>
            <span className="react-word">{REACTION_LABEL[f].word}</span>
          </button>
        ))}
      </div>
      <button className="react-meh" onClick={() => onReact("meh")}>
        Not for me
      </button>
    </div>
  );
}
