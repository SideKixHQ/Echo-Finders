/**
 * Hearing it. The screen you are on while an echo is playing.
 *
 * The whole product in one picture: you are looking at what this place looked like, the
 * street is in front of you, and a voice is telling you what happened here.
 *
 * THE RIBBON IS THE SCRUBBER, which is the idea worth having. A waveform beside a progress
 * bar is an ornament next to a control, and the ornament is the bigger and prettier of the
 * two — so people try to drag it, and nothing happens. Here there is no progress bar: lit
 * means heard, dim means still to come, the playhead sits where you are, and dragging the
 * shape is how you move. One picture doing the work of both.
 *
 * The shape comes from `waveform`, which derives it from the script, because most of the
 * library has no audio yet. That matters more here than it did in the old transport: a
 * scrubber whose peaks have nothing to do with the recording teaches a listener a picture
 * of the audio that is a lie. Derived from the text it is at least about this echo and it
 * is stable for it, and the one thing anybody actually reads off it — how far in, how much
 * left — is true either way, because that comes from the playhead.
 *
 * COLOUR, and a board decision that got overturned by its own code.
 *
 * Board 6 painted these ribbons warm, on the law in `design/brand/README.md`: "Aqua is the
 * interface. Ember is the echo." The ribbon is the echo, so the ribbon is ember. That was
 * a sound reading of the board and it is the wrong reading of this screen, because of what
 * the ribbon then became: THE SCRUBBER. It is the thing you put your thumb on and drag.
 * Under the same one-line law, a thing you operate is cool.
 *
 * So it now carries the brand's own aqua-through-violet gradient — the same three stops as
 * the `routeLine` on the map, `#00e5ff → #3b6bff → #7b3bff` — and the ember moves to the
 * PLAYHEAD, which is the one object on this screen that is genuinely the echo rather than
 * a control: where the voice has got to. The law is not bent; the two things it names
 * simply turned out to be the other way round here.
 *
 * It is also the version that is legible. Four warm fills screen-blended over black gave a
 * narrow brown band, because warm-on-dark has nowhere to go: every stop is already close
 * to the background in luminance. Aqua over black has the full range, and aqua crossing
 * violet under `screen` produces the pinks in the reference without a pink ever being
 * declared — which matters, because the brand gradient ends at violet and inventing a
 * fourth stop for one screen is how palettes rot.
 *
 * The classes are `hear-`, not `ribbon-`. `.ribbon` was already the route progress pill
 * at the top of the map, and its `align-items: center` and pill padding quietly reshaped
 * this whole screen: the plate ran under the frame, the waveform stopped short of its own
 * container, and the two buttons shrank to the width of their labels. Three separate
 * layout mistakes, one name collision.
 *
 * WHAT IS NOT HERE. The board's kicker read "You are the 4th", which needs a backend
 * counting syncs across everybody. There isn't one. The rarity is real and earned, so that
 * stays and the fiction goes.
 */

import { useCallback, useRef, useState } from "react";
import { rarityOf, type Echo } from "@echofinders/core";
import { CATEGORY_LABEL } from "./categories";
import { platePng } from "./archive-plate";
import { Transcript } from "./Transcript";
import { shareText } from "./share";

const RARITY_LABEL: Record<string, string> = {
  common: "",
  uncommon: "Uncommon",
  rare: "Rare",
  singular: "Singular",
};

/** Samples across the ribbon. Enough to read as sound, few enough to stay a shape. */
const W = 390;
const H = 150;
const MID = H / 2;

export interface RibbonProps {
  readonly echo: Echo;
  /** 0 to 1 through the echo. */
  readonly progress: number;
  readonly playing: boolean;
  readonly onPlayPause: () => void;
  readonly onSeek: (fraction: number) => void;
  /** Jump by seconds, signed. The transport's two side buttons. */
  readonly onNudge: (seconds: number) => void;
  readonly onClose: () => void;
  /** The plain-language cut, which the transcript has to follow. */
  readonly simple: boolean;
  readonly onSimple: (on: boolean) => void;
  readonly saved: boolean;
  readonly onSave: () => void;
  /** The plain-language cut is shorter, so the clock has to ask which is playing. */
  readonly durationS: number;
  /**
   * Playback speed, shared with the sheet's transport rather than owned here.
   *
   * It was already in `App`, already wired to the sheet, and already the divisor on the
   * clock — the full-screen player was simply the one place you could not reach it. A
   * speed that only exists on a screen you have to leave the story to open is a speed
   * nobody changes.
   */
  readonly rate: number;
  readonly onRate: (rate: number) => void;
  /** Back to 0:00 and keep playing. Not stop, which is the sheet's and means "done". */
  readonly onRestart: () => void;
  /** The next echo in the queue. `session.skip()`, same as the sheet's "Next echo". */
  readonly onNext: () => void;
}

/**
 * The speeds the pill walks through, and why it is a cycle rather than a pair of steppers.
 *
 * The sheet has minus and plus at 0.1 from 0.7 to 2.0, which is thirteen taps to get from
 * 1× to 2× and is fine on a screen you are sitting with. This screen is the one you use
 * with the phone at arm's length in a street, and there the question is never "0.1 faster"
 * — it is "this narrator is slow". One tap, four useful values, and it comes back round to
 * 1× rather than dead-ending, so nobody has to find their way home from 2×.
 *
 * 0.8 is in it because the plain-language cut exists for tired and second-language
 * listeners and slower is the same kindness.
 */
const RATES = [1, 1.2, 1.5, 2, 0.8] as const;

export function Ribbon({
  echo,
  progress,
  playing,
  onPlayPause,
  onSeek,
  onNudge,
  onClose,
  simple,
  onSimple,
  saved,
  onSave,
  durationS,
  rate,
  onRate,
  onRestart,
  onNext,
}: RibbonProps) {
  const rarity = RARITY_LABEL[rarityOf(echo)] ?? "";
  const photo = echo.archive?.[0];
  const elapsed = Math.round(progress * durationS);
  const left = Math.max(0, durationS - elapsed);
  const at = Math.max(0, Math.min(1, progress));

  const phase = phaseOf(echo.id);
  const track = useRef<HTMLDivElement | null>(null);
  /*
   * Reading along happens HERE rather than by sending you back to the sheet's transcript
   * tab. Being handed back to the map you just left, one detent up, with a tab selected,
   * is three changes of scene to answer "what is she saying". It is the same `Transcript`
   * component and the same seek, so there is no second implementation to fall out of step.
   */
  const [reading, setReading] = useState(false);

  /*
   * Drag anywhere on the ribbon. Pointer capture rather than window listeners, so a finger
   * that slides off the side of the phone mid-scrub still reports where it went and the
   * playhead does not stick.
   */
  const scrub = useCallback(
    (clientX: number) => {
      const box = track.current?.getBoundingClientRect();
      if (!box || box.width < 1) return;
      onSeek(Math.max(0, Math.min(1, (clientX - box.left) / box.width)));
    },
    [onSeek],
  );

  return (
    <div className="hear">
      {/*
        The plate, or an honest absence of one. Most echoes have no archive photograph
        cleared yet (ADR-0006), and inventing one is exactly the thing that later gets
        believed, so a missing plate gets a warm field rather than a fake window.
      */}
      <div className={photo ? "hear-plate" : "hear-plate hear-plate-none"}>
        {photo ? (
          <img src={platePng(photo.imageKey, "then")} alt="" />
        ) : (
          <div className="hear-noplate" aria-hidden="true" />
        )}
        <div className="hear-fade" aria-hidden="true" />
        {photo && <p className="hear-credit mono">{photo.credit}</p>}
      </div>

      <button className="hear-back" onClick={onClose} aria-label="Back to the map">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 5L8 12l6.5 7" />
        </svg>
      </button>

      <div className="hear-say">
        <p className="hear-kicker mono">
          {rarity && <span className="hear-rarity">{rarity}</span>}
          <span>{CATEGORY_LABEL[echo.category]}</span>
        </p>
        <h1>{echo.title}</h1>
      </div>

      <div className="hear-track" ref={track}>
        <div
          className="hear-hit"
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(at * 100)}
          aria-valuetext={`${clock(elapsed)} of ${clock(durationS)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e.clientX);
          }}
          /*
            Arrow keys move by a twentieth, which is five seconds on a two minute echo.
            A slider with no keyboard is a slider half the people on the bus cannot use.
          */
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onSeek(Math.max(0, at - 0.05));
            else if (e.key === "ArrowRight") onSeek(Math.min(1, at + 0.05));
            else if (e.key === "Home") onSeek(0);
            else return;
            e.preventDefault();
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="hear-wave" aria-hidden="true">
            <defs>
              {/* The board's two blurs. The wide one softens the three under-ribbons into
                  light; the tight one keeps the bright core a shape rather than a haze. */}
              <filter id="ribSoft" x="-20%" y="-40%" width="140%" height="180%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <filter id="ribSoft2" x="-20%" y="-40%" width="140%" height="180%">
                <feGaussianBlur stdDeviation="2" />
              </filter>
              <clipPath id="ribHeardClip">
                <rect x="0" y="0" width={W * at} height={H} />
              </clipPath>
              <clipPath id="ribToComeClip">
                <rect x={W * at} y="0" width={W - W * at} height={H} />
              </clipPath>
            </defs>
            {/*
              Heard, at full strength. Still to come, banked right down. Same ribbon, so
              the picture IS the scrubber rather than an ornament sitting next to one.

              The clip is outside the moving group on purpose: the light flows, the
              boundary between heard and unheard does not flow with it.
            */}
            <g clipPath="url(#ribHeardClip)">
              <Flow phase={phase} />
            </g>
            <g clipPath="url(#ribToComeClip)" className="hear-tocome">
              <Flow phase={phase} />
            </g>
            <line className="hear-head" x1={W * at} y1={14} x2={W * at} y2={H - 14} />
            <circle className="hear-head-dot" cx={W * at} cy={MID} r="5" />
          </svg>
        </div>
        <p className="hear-clock mono">
          <span>{clock(elapsed)}</span>
          <span>-{clock(left)}</span>
        </p>
      </div>

      {/*
        THE TWO SETTINGS, above the transport rather than in it.

        Both of these existed in the sheet's player and in neither case could you reach
        them from this screen, which is the actual answer to "what happened to all the
        audio controls": the full-screen player was a strict subset of the small one. Speed
        is the control a spoken-word app is judged on, and the plain-language cut changes
        what you are listening to, so a listener who wants either had to leave the story.

        They sit in their own quiet row because they are things you set once and then stop
        touching, and the transport below is the row you touch every thirty seconds. Same
        ordering rule the sheet's player already follows.
      */}
      <div className="hear-set">
        <button
          className="hear-chip"
          onClick={() => onRate(RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length] ?? 1)}
          aria-label={`Speed, ${rate} times. Tap to change.`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20a8 8 0 1 1 8-8" />
            <path d="M12 12l4.5-3.4" />
          </svg>
          {/*
            One decimal only where it earns one. "1.0×" and "2.0×" are two characters of
            precision nobody asked for, and the row is narrow.
          */}
          {Number.isInteger(rate) ? rate : rate.toFixed(1)}×
        </button>
        <button
          className={simple ? "hear-chip on" : "hear-chip"}
          onClick={() => onSimple(!simple)}
          disabled={!echo.simple}
          aria-pressed={simple}
          /* Said out loud, because a disabled control with no reason on it is a bug to
             everybody who meets one. The gap is in the library, not in the app. */
          aria-label={echo.simple ? "Plain language cut" : "No plain language cut for this echo"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 14a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z" />
          </svg>
          Plain words
        </button>
      </div>

      <div className="hear-transport">
        {/*
          Restart, on the glyph every player uses for it. First press goes to the start,
          which is what a listener who has just walked under a bus and missed the opening
          line reaches for — and what `Home` on the scrubber already did with no button.
        */}
        <button onClick={onRestart} aria-label="Back to the start">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 5v14l-9.5-7z" className="hear-solid" />
            <path d="M6 5v14" />
          </svg>
        </button>
        <button onClick={() => onNudge(-15)} aria-label="Back fifteen seconds">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 5L6.5 9.2 11 13.4" />
            <path d="M6.8 9.2H14a4.6 4.6 0 0 1 0 9.2H9" />
          </svg>
        </button>
        <button className="hear-go" onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="5" width="4" height="14" rx="1.2" />
              <rect x="13" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button onClick={() => onNudge(15)} aria-label="Forward fifteen seconds">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 5l4.5 4.2L13 13.4" />
            <path d="M17.2 9.2H10a4.6 4.6 0 0 0 0 9.2h5" />
          </svg>
        </button>
        {/*
          Next echo. The one control on this screen that is arguably against the product —
          ADR-0010 says arriving is the mechanic and nothing plays that you did not walk
          to. It is here because `session.skip()` only ever moves through echoes you have
          ALREADY synced, so it skips within what you earned rather than handing you
          something you did not. The sheet has had exactly this button all along.
        */}
        <button onClick={onNext} aria-label="Next echo">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 5v14l9.5-7z" className="hear-solid" />
            <path d="M18 5v14" />
          </svg>
        </button>
      </div>

      <div className="hear-acts">
        <button
          className={reading ? "on" : ""}
          onClick={() => setReading((r) => !r)}
          aria-pressed={reading}
          aria-expanded={reading}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5h14M5 10h14M5 15h10" />
          </svg>
          {/*
            "Hide it" rather than "Hide the words", which is better copy and no longer
            fits: this row is three buttons wide now and fourteen characters ran the label
            under its own icon at 375px. Measured, not guessed.
          */}
          {reading ? "Hide it" : "Read it"}
        </button>
        <button className={saved ? "on" : ""} onClick={onSave} aria-pressed={saved}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 21l-6-3.6L6 21V5.4A1.4 1.4 0 0 1 7.4 4h9.2A1.4 1.4 0 0 1 18 5.4z" />
          </svg>
          {saved ? "Kept" : "Keep"}
        </button>
        {/*
          Share, which the card has had all along and the screen you are actually on while
          the story lands did not. This is the moment somebody wants to tell somebody
          else, and it was two taps back to a card to do it.

          No link, because there is no link: nothing in this app has a URL of its own yet
          (no router, no deep link, `docs/03-selling.md`). A share button that pastes a
          dead address is worse than one that pastes a sentence, so it sends the title,
          the place and the teaser — which is a thing somebody can act on by walking there.
          It gets a URL the day echoes get addresses.
        */}
        <button
          onClick={() => {
            void shareText(
              echo.title,
              `${echo.title} — ${echo.point.place}. ${echo.teaser ?? echo.summary}`,
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15V3M8.5 6.5L12 3l3.5 3.5" />
            <path d="M6 12H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />
          </svg>
          Share
        </button>
      </div>

      {/*
        Over the plate and the ribbon rather than pushing them off screen, because the
        transport has to stay put: somebody reading along is exactly the person most likely
        to want to pause or jump back a line.
      */}
      {reading && (
        <div className="hear-read">
          <Transcript echo={echo} simple={simple} progress={at} onSeek={onSeek} />
        </div>
      )}
    </div>
  );
}

/**
 * THE RIBBON, as board 6 draws it: sound as flowing light, not as a bar chart.
 *
 * What was here before was a closed band built from sixty-four samples of `waveform()`,
 * which derives amplitude from the script's sentence lengths. Two things were wrong with
 * it, and the first one is the one that was visible from across the room: rendered, it was
 * a jagged brown blob. A single flat fill of dim ember over black has no light in it at
 * all, and the noise it was drawing has no rhythm, because sentence lengths are not a
 * rhythm.
 *
 * The second is worse and quieter. It looked like a waveform, so it claimed to be one, and
 * its peaks are in places the audio has nothing. The board never asked for amplitude. Its
 * note says the reference was "taken but not copied": sound drawn as flowing light, with
 * the rainbow removed and the shape given a job. So there is no data here to be wrong.
 *
 * Four overlapping bezier ribbons, three of them blurred, blended with `screen` so they
 * ADD where they cross — which is where the light comes from, and why the flat fill could
 * never have got there.
 *
 * The paths are the board's own, to the coordinate. The palette is not: see COLOUR at the
 * top of this file. It is the brand gradient, back to front, so the deepest violet is the
 * widest and softest layer and the aqua core sits on top of it — which is the order light
 * actually stacks in, and the order the reference has.
 */
const RIBBONS: readonly { readonly d: string; readonly fill: string; readonly opacity: number; readonly blur?: string }[] = [
  {
    d: "M0 60 C 44 30, 78 26, 110 42 C 142 58, 164 86, 200 88 C 238 90, 262 58, 296 44 C 328 31, 360 36, 390 52 L390 70 C 360 54, 328 49, 296 62 C 262 76, 238 108, 200 106 C 164 104, 142 76, 110 60 C 78 44, 44 48, 0 78 Z",
    fill: "#7b3bff", opacity: 0.68, blur: "url(#ribSoft)",
  },
  {
    d: "M0 84 C 48 104, 84 100, 118 80 C 152 60, 182 36, 220 40 C 258 44, 282 76, 318 85 C 348 92, 370 85, 390 72 L390 90 C 370 103, 348 110, 318 103 C 282 94, 258 62, 220 58 C 182 54, 152 78, 118 98 C 84 118, 48 122, 0 102 Z",
    fill: "#3b6bff", opacity: 0.62, blur: "url(#ribSoft)",
  },
  {
    d: "M0 44 C 40 58, 70 68, 104 62 C 140 55, 168 28, 206 24 C 246 20, 274 44, 310 55 C 340 64, 368 59, 390 44 L390 58 C 368 73, 340 78, 310 69 C 274 58, 246 34, 206 38 C 168 42, 140 69, 104 76 C 70 82, 40 72, 0 58 Z",
    fill: "#00e5ff", opacity: 0.6, blur: "url(#ribSoft2)",
  },
  {
    d: "M0 66 C 44 44, 80 42, 114 55 C 150 69, 174 94, 210 94 C 246 94, 270 66, 304 54 C 334 43, 364 46, 390 58 L390 63 C 364 51, 334 48, 304 59 C 270 71, 246 99, 210 99 C 174 99, 150 74, 114 60 C 80 47, 44 49, 0 71 Z",
    fill: "#dff7ff", opacity: 0.95,
  },
];

/**
 * The flowing group, drawn twice so the loop has no seam.
 *
 * The board translates by 38px and repeats, which snaps every nine seconds because the
 * artwork does not tile at 38. Two copies a full width apart, translated by exactly that
 * width, return to an identical picture — so the light moves forever and never jumps.
 *
 * `phase` is a per-echo delay. The same ribbon under every story would be a brand object,
 * which is fine, but two echoes opened one after another should not be frame-locked to
 * each other. It shifts where the loop starts and nothing else: it is not pretending to
 * be anything about the audio.
 */
function Flow({ phase }: { readonly phase: number }) {
  return (
    /*
      NEGATIVE. The sign is the whole thing, and it was wrong.

      A positive `animation-delay` does not shift where a loop starts — it postpones the
      animation, and with the default `animation-fill-mode: none` nothing at all is
      applied while it waits. `phaseOf` returns up to 18 seconds, so an echo could open
      and the ribbon could sit completely still for the length of a full pass before it
      ever moved. Measured in a browser: `getAnimations()` reported the animation
      "running" and its `currentTime` climbing, while the computed transform stayed
      `none` and the artwork did not move a pixel. "Running" during a delay is running.

      Negative starts the animation already that far in, which is the idiom and what the
      comment below always claimed this did.
    */
    <g className="hear-flow" style={{ animationDelay: `${(-phase).toFixed(2)}s` }}>
      {[0, W].map((dx) => (
        <g key={dx} transform={dx ? `translate(${dx} 0)` : undefined}>
          {RIBBONS.map((r) => (
            <path
              key={`${dx}/${r.fill}`}
              className="hear-rib"
              d={r.d}
              fill={r.fill}
              opacity={r.opacity}
              {...(r.blur ? { filter: r.blur } : {})}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/** A stable 0 to FLOW_S offset from the echo's id, so two echoes are not in lockstep. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 * FLOW_S;
}
/** Seconds for one full pass. Matches `.hear-flow` in `theme.css`. */
const FLOW_S = 18;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.round(seconds % 60))).padStart(2, "0")}`;
