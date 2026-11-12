/**
 * My echoes.
 *
 * Not the same thing as "Saved" in the flight prototype, and merging them would muddle
 * both: saved is *places you want to go*, this is *places you actually stood*. One is a
 * wish list; the other is a record.
 *
 * That record is the reason someone keeps the app. A number that goes up is a poor reason;
 * "here is everywhere your life has passed through, and what happened there" is a good one.
 *
 * **Grouped by whether you have heard it, not by how rare it is.** Finding an echo and
 * hearing it are separate acts by design (ADR-0010): arriving collects it, and pressing
 * play is a decision, so "collected and never listened to" is a real and common state. The
 * backlog comes first and it is the actionable half; saved echoes, still to visit, sit
 * under it; what you have already heard sits last, quieter, as the record.
 *
 * Drawn to the approved boards (MyEchoes, MyEchoesFilter, MyEchoesRare, MyEchoesEmpty,
 * 2026-11-11): three tiles, the map's two filter pills, and rows that carry the echo
 * character. James's calls on that review:
 *
 *   1. Filters apply on each tap. No "Show N echoes" button; the pill and the section
 *      heads say how many are left.
 *   2. No "verified" on rows. A row says "Legend" or "Disputed" when that applies, so a
 *      listener always knows when it is not fact (ADR-0017); the full mark is on the card.
 *   3. True crime earns a rare find like any other echo (`my-echoes.ts`).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CaptureEvent, Echo, EchoCategory, PrivacySettings, TravelMode } from "@echofinders/core";
import { EchoCharacter, type EchoFace } from "@echofinders/echo";
import { CATEGORY_ICON, CATEGORY_LABEL, toggleCategories, ALL_CATEGORIES, type ChipGroup } from "./categories";
import { KindPicker } from "./KindPicker";
import { platePng } from "./archive-plate";
import { truthFor } from "./TruthMark";
import { dayLabel, isRareFind, minutesLabel, placeOf, rareFindCount, rareWhy, shortPlace } from "./my-echoes";

interface Props {
  readonly captured: readonly CaptureEvent[];
  /** How each found echo was found: walking, driving, flying. What "How you got there" filters by. */
  readonly travelOf: (echoId: string) => TravelMode;
  readonly privacy: PrivacySettings;
  /** Play one, from anywhere, at any time, which is the whole point of keeping them. */
  readonly onPlay: (echo: Echo) => void;
  readonly isPlaying: (echoId: string) => boolean;
  /**
   * Whether this one has actually been listened to.
   *
   * Asked of the live tracker rather than read off `capture.record`, because a capture
   * event is built at the moment of arrival and its record is a snapshot from before
   * anybody pressed play.
   */
  readonly isHeard: (echoId: string) => boolean;
  /** The face this listener gave each echo, if any (`ReactionCard.tsx`). */
  readonly faceOf?: (echoId: string) => string | null;
  /** Echoes bookmarked but not yet stood on. Intentions, as against the record. */
  readonly saved: readonly Echo[];
  /** Save or unsave. Unsave lives on the echo's card now; kept for callers. */
  readonly onSave: (echo: Echo) => void;
  /** Go, on a saved row: the map, on that echo, its card open. */
  readonly onGo?: (echo: Echo) => void;
  /** The empty state's next step: back to the map, on you. */
  readonly onFindNear?: () => void;
  /** How you are travelling, because it decides what "being there" means. */
  readonly mode: TravelMode;
  /** Echoes, or the listener's routes (`Routes.tsx`), drawn in place of the list. */
  readonly view?: "echoes" | "routes";
  readonly onView?: (view: "echoes" | "routes") => void;
  readonly routes?: ReactNode;
}

/** Echoes | Routes, under the title: the trip sheet's segmented control. */
function ViewSwitch({ view, onView }: { view: "echoes" | "routes"; onView: (v: "echoes" | "routes") => void }) {
  return (
    <div className="coll-views" role="tablist" aria-label="Show">
      {(["echoes", "routes"] as const).map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          className={view === v ? "coll-view on" : "coll-view"}
          onClick={() => onView(v)}
        >
          {v === "echoes" ? "Echoes" : "Routes"}
        </button>
      ))}
    </div>
  );
}

/** One line, in the same short style, for each way an echo can land here. */
const EMPTY_LINE: Record<TravelMode, string> = {
  walking: "Walk to an echo and it lands here, ready to play anytime.",
  cycling: "Ride to an echo and it lands here, ready to play anytime.",
  driving: "Drive past an echo and it lands here. No need to stop.",
  flight: "Echoes download before you fly and open as you pass over.",
  rail: "Echoes download before you leave and open as you pass.",
};

/** The order "How you got there" offers, slowest first, as a person would list them. */
const TRAVEL_ORDER: readonly TravelMode[] = ["walking", "cycling", "driving", "rail", "flight"];
const TRAVEL_LABEL: Record<TravelMode, string> = {
  walking: "Walk",
  cycling: "Ride",
  driving: "Drive",
  rail: "Train",
  flight: "Fly",
};

type Box = "kind" | "place" | "rare" | null;

/**
 * A box that closes on a tap outside it or on Escape, as the map's kind box does. The tap
 * that closes it lands on the scrim, so it never also plays the row underneath.
 */
function useDismiss(open: boolean, inside: readonly RefObject<HTMLElement>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (inside.some((r) => r.current?.contains(t))) return;
      if ((e.target as Element).classList?.contains("menu-scrim") || (e.target as Element).classList?.contains("me-dim")) return;
      close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      (inside[0]?.current as HTMLElement | null)?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, inside, close]);
}

export function Collection({
  captured,
  travelOf,
  privacy,
  onPlay,
  isPlaying,
  isHeard,
  saved,
  onGo,
  onFindNear,
  mode,
  faceOf,
  view = "echoes",
  onView,
  routes,
}: Props) {
  /*
   * The filters. Kind is the map's own box and rule (`KindPicker`, `toggleCategories`), so
   * it behaves the same in both places; null is everything. Place and How you got there
   * pick one at a time. Rare is "Show my N" in the Rare finds callout. Every tap applies
   * at once (James, 2026-11-11).
   */
  const [cats, setCats] = useState<ReadonlySet<EchoCategory> | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [travel, setTravel] = useState<TravelMode | null>(null);
  const [rareOnly, setRareOnly] = useState(false);
  const [box, setBox] = useState<Box>(null);
  const onToggle = useCallback((group: ChipGroup) => setCats((c) => toggleCategories(c, group)), []);
  const onAllKinds = useCallback(() => setCats(null), []);
  const clearAll = useCallback(() => {
    setCats(null);
    setPlace(null);
    setTravel(null);
    setRareOnly(false);
  }, []);
  const closeBox = useCallback(() => setBox(null), []);
  const onKindOpen = useCallback((o: boolean) => setBox((b) => (o ? "kind" : b === "kind" ? null : b)), []);

  const placeTap = useRef<HTMLButtonElement>(null);
  const placeBox = useRef<HTMLDivElement>(null);
  const rareTap = useRef<HTMLButtonElement>(null);
  const rareBox = useRef<HTMLDivElement>(null);
  const pills = useRef<HTMLDivElement>(null);
  const placeRefs = useRef([placeTap, placeBox] as const).current;
  const rareRefs = useRef([rareTap, rareBox] as const).current;
  useDismiss(box === "place", placeRefs, closeBox);
  useDismiss(box === "rare", rareRefs, closeBox);

  /*
   * A short phone keeps a row in view under an open box. Opened low on a 375x667 screen,
   * the box would cover every row, and the count on the pill would be the only sign a tap
   * did anything; so the list scrolls up until the pills sit at the top of the screen.
   */
  useLayoutEffect(() => {
    if (box !== "kind" && box !== "place") return;
    const row = pills.current;
    const body = row?.closest(".screen-body");
    const drop = row?.querySelector<HTMLElement>(".kind-box");
    if (!row || !body || !drop) return;
    // A row is about 100px; under 200 left, at most one shows, partly.
    const room = body.getBoundingClientRect().bottom - drop.getBoundingClientRect().bottom;
    if (room >= 200) return;
    const by = row.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
    if (by <= 0) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top: body.scrollTop + by, behavior: still ? "auto" : "smooth" });
  }, [box]);

  const switcher = onView && routes ? <ViewSwitch view={view} onView={onView} /> : null;
  const head = (rest?: ReactNode) => (
    <header className="screen-head coll-head">
      <div className="coll-title">
        <h1>My echoes</h1>
      </div>
      {switcher}
      {rest}
    </header>
  );

  if (switcher && view === "routes") {
    return (
      <div className="screen-body">
        {head()}
        {routes}
      </div>
    );
  }

  if (captured.length === 0 && saved.length === 0) {
    return (
      <div className="screen-body">
        {/* No filter until there is something to filter: a control that can only ever
            show "nothing" is one more thing to wonder about. */}
        {head()}
        <div className="empty me-empty">
          <svg className="me-empty-echo" viewBox="-60 -60 120 120" aria-hidden="true">
            <EchoCharacter face="calling" r={46} uid="me-empty" detail={false} />
          </svg>
          <b>Nothing synced yet</b>
          <span>{EMPTY_LINE[mode]}</span>
          {onFindNear && (
            <button className="coll-find" onClick={onFindNear}>
              Find echoes near me
            </button>
          )}
        </div>
      </div>
    );
  }

  const shown = (echo: Echo) =>
    (!cats || cats.has(echo.category)) && (!place || placeOf(echo) === place) && (!rareOnly || isRareFind(echo));
  const filtered = captured.filter((c) => shown(c.echo) && (!travel || travelOf(c.echo.id) === travel));
  const unheard = filtered.filter((c) => !isHeard(c.echo.id));
  const heard = filtered.filter((c) => isHeard(c.echo.id));
  // Saved echoes were never stood on: they are not finds, and they have no way of
  // travelling, so a Travel or a Rare filter shows only what was found that way.
  const wishlist = saved.filter(
    (e) => shown(e) && !travel && !rareOnly && !captured.some((c) => c.echo.id === e.id),
  );
  const results = filtered.length + wishlist.length;
  // Only what this collection holds: a filter never offers a place or a way of
  // travelling that would show nothing.
  const places = [...new Set([...captured.map((c) => placeOf(c.echo)), ...saved.map(placeOf)])].sort();
  const travels = TRAVEL_ORDER.filter((m) => captured.some((c) => travelOf(c.echo.id) === m));
  const filtering = cats !== null || place !== null || travel !== null || rareOnly;
  const nothingMatches = filtering && results === 0;

  const rareCount = rareFindCount(captured.map((c) => c.echo));
  const minutes = Math.round(captured.reduce((t, c) => t + c.echo.durationS, 0) / 60);
  // "New York", "Walk", or "New York +1" with both: the kind pill's own way of saying more.
  const where = place && travel ? `${place} +1` : place ?? (travel ? TRAVEL_LABEL[travel] : "Everywhere");
  const whereFull = [place, travel ? TRAVEL_LABEL[travel] : null].filter(Boolean).join(", ") || "Everywhere";
  const placeOn = place !== null || travel !== null;

  const group = (key: "unheard" | "heard", label: string, items: readonly CaptureEvent[]) =>
    items.length > 0 && (
      <section key={key} className={`group group-${key}`} aria-label={label}>
        <h3 className="group-head">
          {label} · {items.length}
        </h3>
        {items.map((capture) => (
          <Entry
            key={capture.echo.id}
            capture={capture}
            onPlay={onPlay}
            playing={isPlaying(capture.echo.id)}
            heard={isHeard(capture.echo.id)}
            face={faceOf?.(capture.echo.id) ?? null}
          />
        ))}
      </section>
    );

  return (
    <div className="screen-body">
      {head(
        <>
          {/*
            Three numbers, because progress belongs on the screen you look things up on
            rather than the one you walk with. Rare finds are rare and extra rare together
            (`rarityOf`), hand picked with a reason since 2026-11-12
            (docs/adr/0021-topics-and-rare.md).
          */}
          <div className="me-tiles">
            <div className="me-tile">
              <b className="me-tile-n me-tile-ember">{captured.length}</b>
              <span>Synced</span>
            </div>
            <button
              ref={rareTap}
              className={`me-tile me-tile-rare${rareOnly ? " on" : ""}`}
              aria-expanded={box === "rare"}
              aria-controls="me-rare"
              aria-pressed={rareOnly}
              onClick={() => setBox((b) => (b === "rare" ? null : "rare"))}
            >
              <b className="me-tile-n me-tile-core">{rareCount}</b>
              <span>
                Rare finds
                <svg className="me-info" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v6M12 7.5h.01" />
                </svg>
              </span>
            </button>
            <div className="me-tile">
              <b className="me-tile-n">{minutes}</b>
              <span>Minutes</span>
            </div>
            {box === "rare" && (
              <>
                <div className="me-dim" aria-hidden="true" onClick={closeBox} />
                <div className="me-rare-box" id="me-rare" ref={rareBox} role="dialog" aria-label="Rare finds">
                  <svg className="me-rare-echo" viewBox="-60 -60 120 120" aria-hidden="true">
                    <EchoCharacter face="calling" r={46} uid="me-rare-echo" detail={false} />
                  </svg>
                  <div className="me-rare-words">
                    <b>Rare finds take some finding</b>
                    <p>Picked by hand: inside with opening hours, only at certain times, hard to reach, or easy to miss.</p>
                    <div className="me-rare-acts">
                      {rareOnly ? (
                        <button
                          className="me-rare-show"
                          onClick={() => {
                            setRareOnly(false);
                            closeBox();
                          }}
                        >
                          Show all
                        </button>
                      ) : (
                        rareCount > 0 && (
                          <button
                            className="me-rare-show"
                            onClick={() => {
                              setRareOnly(true);
                              closeBox();
                            }}
                          >
                            Show my {rareCount}
                          </button>
                        )
                      )}
                      <button className="me-rare-ok" onClick={closeBox}>
                        Got it
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* The map's two pills: what kind, and where. */}
          <div className="me-pills" ref={pills}>
            <KindPicker
              on={cats ?? ALL_CATEGORIES}
              onToggle={onToggle}
              onAll={onAllKinds}
              count={results}
              open={box === "kind"}
              onOpenChange={onKindOpen}
            />
            <button
              ref={placeTap}
              className={`kind-tap me-place-tap${placeOn ? " is-filtered" : ""}`}
              aria-expanded={box === "place"}
              aria-controls="place-box"
              aria-label={`Where: ${whereFull}${placeOn ? `, ${results}` : ""}`}
              onClick={() => setBox((b) => (b === "place" ? null : "place"))}
            >
              <svg className="me-pin" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="kind-label me-place-label">{where}</span>
              {placeOn && <span className="kind-count">· {results}</span>}
              <svg className="kind-chev" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9.5l6 6 6-6" />
              </svg>
            </button>
            {box === "place" && (
              <>
                <div className="menu-scrim" aria-hidden="true" onClick={closeBox} />
                <div className="kind-box me-place-box" id="place-box" ref={placeBox}>
                  <p className="me-box-head">Place</p>
                  <div className="me-places" role="group" aria-label="Place">
                    {[null, ...places].map((p) => {
                      const on = place === p;
                      return (
                        <button
                          key={p ?? "everywhere"}
                          className={`me-place${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={() => setPlace(p)}
                        >
                          {on && (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M5 12.5 L10 17.5 L19 7" />
                            </svg>
                          )}
                          {p ?? "Everywhere"}
                        </button>
                      );
                    })}
                  </div>
                  {travels.length > 0 && (
                    <>
                      <p className="me-box-head">How you got there</p>
                      <div className="me-ways" role="group" aria-label="How you got there">
                        {[null, ...travels].map((m) => (
                          <button
                            key={m ?? "any"}
                            className={`me-way${travel === m ? " on" : ""}`}
                            aria-pressed={travel === m}
                            onClick={() => setTravel(m)}
                          >
                            {m ? TRAVEL_LABEL[m] : "Any"}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </>,
      )}

      {nothingMatches && (
        <div className="empty coll-nomatch">
          <b>Nothing matches</b>
          <span>None of your echoes fit everything you picked.</span>
          <button className="coll-showall" onClick={clearAll}>
            Show all
          </button>
        </div>
      )}

      {group("unheard", "Not heard yet", unheard)}

      {/*
        Saved: places you want to go, as against places you stood. Each with Go, which
        opens its card on the map, as in Search; Unsave is on that card.
      */}
      {wishlist.length > 0 && (
        <section className="group group-saved" aria-label="Saved">
          <h3 className="group-head">Saved · {wishlist.length}</h3>
          {wishlist.map((echo) => (
            <article key={echo.id} className="entry entry-wish">
              <div className="entry-row">
                <Thumb echo={echo} face="sealed" uid={`me-s-${echo.id}`} />
                <div className="entry-text">
                  <h4>{echo.title}</h4>
                  <p>{shortPlace(echo.point.place)}</p>
                  <Meta echo={echo} />
                </div>
              </div>
              {onGo && (
                <button className="saved-go" onClick={() => onGo(echo)} aria-label={`Go to ${echo.title}`}>
                  Go
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      {group("heard", "Heard", heard)}

      <footer className="collection-foot">
        {privacy.recordPrecisePlaces ? (
          <p>
            Your collection records where you were standing. You can turn that off in Settings
            without losing anything above.
          </p>
        ) : (
          <p>
            Your collection records <strong>which</strong> echoes you synced and when, not
            where you were standing. Turn that on in Settings if you want a personal map.
          </p>
        )}
      </footer>
    </div>
  );
}

function Entry({
  capture,
  onPlay,
  playing,
  heard,
  face,
}: {
  capture: CaptureEvent;
  onPlay: (echo: Echo) => void;
  playing: boolean;
  heard: boolean;
  face: string | null;
}) {
  const echo = capture.echo;
  return (
    <article className={`entry${playing ? " entry-playing" : ""}${heard ? " entry-heard" : ""}`}>
      {/* The whole row plays it: one tap, possibly while walking. */}
      <button className="entry-hit" onClick={() => onPlay(echo)} aria-label={`Play ${echo.title}`}>
        <Thumb echo={echo} face={playing ? "playing" : heard ? "heard" : "armed"} uid={`me-${echo.id}`} />
        <div className="entry-text">
          <h4>
            {echo.title}
            {face && (
              <span className="entry-face" aria-label="Your reaction">
                {face}
              </span>
            )}
          </h4>
          <p>{shortPlace(echo.point.place)}</p>
          <Meta echo={echo} when={new Date(capture.record.capturedAt)} playing={playing} />
        </div>
      </button>
    </article>
  );
}

/**
 * The row's picture: the echo's archive photograph with the character's face as a badge,
 * or the character alone. The face is the state: a play mark not heard yet, closed lids
 * heard, turned away for saved. The length moved off it to the line under the title.
 */
function Thumb({ echo, face, uid }: { echo: Echo; face: EchoFace; uid: string }) {
  const photo = echo.archive?.[0];
  const character = (
    <svg viewBox="-60 -60 120 120" aria-hidden="true">
      <EchoCharacter face={face} r={48} uid={uid} detail={false} />
    </svg>
  );
  if (!photo) return <span className="me-thumb me-thumb-echo" aria-hidden="true">{character}</span>;
  return (
    <span className="me-thumb me-thumb-photo" aria-hidden="true">
      <span className="me-photo">
        <img src={platePng(photo.imageKey, "then")} alt="" draggable={false} />
      </span>
      <span className="me-badge">{character}</span>
    </span>
  );
}

/**
 * Kind · length · day, then "Legend" or "Disputed" where it is not fact (ADR-0017), then
 * "Rare find". No "verified" on a row (James, 2026-11-11): the full mark is on the card.
 */
function Meta({ echo, when, playing = false }: { echo: Echo; when?: Date; playing?: boolean }) {
  const truth = truthFor(echo);
  const parts: ReactNode[] = [
    <span key="kind" className={`me-kind cat-${echo.category}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {CATEGORY_ICON[echo.category]}
      </svg>
      {CATEGORY_LABEL[echo.category]}
    </span>,
    <span key="len">{minutesLabel(echo.durationS)}</span>,
  ];
  if (playing) parts.push(<span key="when" className="entry-now">Playing</span>);
  else if (when) parts.push(<span key="when" className="me-day">{dayLabel(when)}</span>);
  if (truth === "legend") parts.push(<span key="truth" className="truth truth-legend">Legend</span>);
  if (truth === "disputed") parts.push(<span key="truth" className="truth truth-disputed">Disputed</span>);
  if (isRareFind(echo))
    parts.push(
      <span key="rare" className="me-rare" title={rareWhy(echo) ?? undefined}>
        Rare find
      </span>,
    );
  return (
    <span className="entry-meta">
      {/* The dot rides at the end of each part, so a wrapped line never starts with one. */}
      {parts.map((part, i) => (
        <span key={i} className="me-part">
          {part}
          {i < parts.length - 1 && (
            <span className="me-dot" aria-hidden="true">
              ·
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
