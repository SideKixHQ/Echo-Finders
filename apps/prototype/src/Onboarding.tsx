/**
 * First run, rebuilt against the design's own onboarding.
 *
 * The version this replaces was three steps written from a *list of step names* rather than
 * from the prototype, which is the same mistake that produced an aeroplane sharing nothing
 * with the design's aeroplane but the word. The design's flow is six steps with a back
 * button, and each one earns its place; mine had no welcome, no interests, no headphone
 * check, no way back, and a first step with no way forward at all.
 *
 * What is taken verbatim: the shape (welcome, then one decision per screen, dots and a
 * back arrow in a fixed header), the three value cards on the welcome, interests as the
 * same chips the map uses, audience as two cards rather than a switch, and a headphone
 * check that plays something.
 *
 * What is ours, and why: the design is a flight product, so its second step asks for a
 * flight number. Ours has to ask something prior to that, because a walker has no flight
 * and no route at all — and that question turns out to be the most important screen in the
 * app. See `docs/04-shape-of-the-app.md`: the whole product had exactly one front door and
 * it was the wrong one for the commonest case.
 *
 * Location is asked for on the step whose reason makes it obvious, and only on the path
 * that needs it now. A permission requested cold is a permission lost — on iOS a refusal
 * cannot be re-prompted, only fixed in Settings, which nobody does — so the words come from
 * `CAPABILITY_NEEDS` and arrive after the listener has said they want to walk around here.
 */

import { useState } from "react";
import { MODE_ICON } from "./travel";
import { CAPABILITY_NEEDS, type EchoCategory, type TravelMode } from "@echofinders/core";
import { CHIP_GROUPS } from "./categories";
import type { LocationState } from "./browser-location";

/**
 * Flight number to route.
 *
 * A stub, and labelled as one. Real lookup is a flight-data API — you send `UA 2314` and
 * a date, and you get back a filed route, which is the only way to know that today's UA
 * 2314 is going where yesterday's did. Until that exists this matches the flights we have
 * content for, so the screen can be built, used and judged now rather than waiting on a
 * vendor decision.
 *
 * It is deliberately forgiving about spacing and case, because somebody is typing a code
 * off a boarding pass on a phone.
 */
const FLIGHT_ROUTES: Readonly<Record<string, string>> = {
  DL411: "jfk-mia",
  AA118: "jfk-mia",
  B6615: "jfk-mia",
  UA2314: "jfk-mia",
};

export const lookupFlight = (entered: string): string | null =>
  FLIGHT_ROUTES[entered.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? null;

export interface OnboardingProps {
  readonly onAskLocation: () => Promise<LocationState>;
  readonly kids: boolean;
  readonly onKids: (on: boolean) => void;
  /** Which categories are on. Same set the map's chip row drives. */
  readonly cats: ReadonlySet<EchoCategory>;
  readonly onToggleCats: (categories: readonly EchoCategory[]) => void;
  readonly simple: boolean;
  readonly onSimple: (on: boolean) => void;
  /** Hear the narrator, so a volume can be set before anybody is out in the street. */
  readonly onTestLine: () => void;
  /**
   * Done. `roaming` true means free roam from here; false means they picked a journey.
   * `mode` is how they are travelling, which decides what syncing an echo even means.
   */
  readonly onDone: (choice: {
    readonly roaming: boolean;
    readonly mode: "walking" | "driving" | "flight";
  }) => void;
  /** Routes we have content for, so a flight number can resolve to one. */
  readonly routes: readonly {
    readonly id: string;
    readonly name?: string;
    readonly mode: TravelMode;
  }[];
  /**
   * A journey resolved to one of ours, by flight number or by picking a drive. Null clears
   * it. Named for the flight case it started as; it now carries either.
   */
  readonly onFlight: (routeId: string | null) => void;
}

const LOCATION = CAPABILITY_NEEDS.find((n) => n.capability === "location-foreground")!;

const ICON = {
  /* The same car the map and the mode picker draw, so one vehicle means one thing. */
  car: MODE_ICON.driving,
  walk: (
    <>
      <circle cx="13" cy="4" r="2" />
      <path d="M12.5 22l-1-6-3-3 1.5-5 3 1.5 2.5 2.5M9.5 8L7 10.5M11.5 16l-3 6" />
    </>
  ),
  plane: <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5L21 16z" />,
  ear: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z" />
    </>
  ),
  kid: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14a5 5 0 0 0 7 0" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
};

/** Bars for the headphone check. Deterministic, so it does not flicker on every render. */
const BARS = Array.from({ length: 40 }, (_, i) => 18 + Math.abs(Math.sin(i * 0.8)) * 70);

/*
 * Walking has nothing to look up, so it is one screen shorter. Driving and flying both ask
 * what the journey is, in their own words.
 */
const lastStep = (roaming: boolean) => (roaming ? 5 : 6);

export function Onboarding({
  onAskLocation,
  kids,
  onKids,
  cats,
  onToggleCats,
  simple,
  onSimple,
  onTestLine,
  onDone,
  routes,
  onFlight,
}: OnboardingProps) {
  const [step, setStep] = useState(0);
  /*
   * Three products, not two.
   *
   * This was a boolean: roam, or have a journey. Driving fell into "roam" with walking,
   * which is how a driver ended up being told to stand on the spot, and how the one mode
   * that most wants a route was the one mode that could not have one.
   */
  const [travel, setTravel] = useState<"walking" | "driving" | "flight">("walking");
  const roaming = travel === "walking";
  const [asking, setAsking] = useState(false);
  const [located, setLocated] = useState<LocationState["kind"] | null>(null);
  const [flight, setFlight] = useState("");
  /** The drive they chose, if any. Null means they are hunting rather than following. */
  const [picked, setPicked] = useState<string | null>(null);
  /** The drives we have content for. */
  const drives = routes.filter((route) => route.mode === "driving");
  const matched = lookupFlight(flight);
  const matchedRoute = matched ? routes.find((r) => r.id === matched) : undefined;

  const next = () => setStep((s) => Math.min(lastStep(roaming), s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const finish = () => onDone({ roaming, mode: travel });

  const chosenCount = CHIP_GROUPS.filter((g) => g.categories.some((c) => cats.has(c))).length;

  const askThenNext = async () => {
    setAsking(true);
    setLocated((await onAskLocation()).kind);
    setAsking(false);
    next();
  };

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Welcome to Echo Finders">
      {/* The design keeps back, dots and skip in a fixed header on every step but the
          first, which is what makes a six step flow feel like three. */}
      {step > 0 && (
        <div className="onb-top">
          <button className="onb-back" onClick={back} aria-label="Back">
            <svg viewBox="0 0 24 24">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="onb-dots" aria-hidden="true">
            {Array.from({ length: lastStep(roaming) }, (_, i) => (
              <i key={i} className={i < step ? "on" : ""} />
            ))}
          </span>
          <button className="onb-skip" onClick={finish}>
            Skip
          </button>
        </div>
      )}

      <div className="onb-body">
        {step === 0 && (
          <>
            <p className="onb-wordmark">ECHO FINDERS</p>
            <h2>The ground beneath you, narrated.</h2>
            <p className="onb-lead">
              Headphones in. Echo Finders tells you what happened where you are standing: the
              history, the crimes, the local legends, and the places worth going to.
            </p>
            <Value icon={ICON.pin} title="Stories fixed to real places">
              You have to be there. On foot you stand on the spot; driving, you go through
              it. Either way, being there is what syncs it.
            </Value>
            <Value icon={ICON.ear} title="Audio first">
              Listen with the screen off. Read along if you would rather.
            </Value>
            <Value icon={ICON.plane} title="Walking, driving or flying">
              On foot it finds what is around you. In the air it follows your flight.
            </Value>
            <button className="onb-go" onClick={next}>
              Get started
            </button>
          </>
        )}

        {step === 1 && (
          <>
            {/*
              The screen the app did not have. Everything before this asked which prepared
              route you were on, which is a real question in the air and a fiction on foot.
            */}
            <h2>How are you travelling?</h2>
            <p className="onb-lead">
              This changes what the app does, not just what it shows. You can switch later.
            </p>
            <button
              className={travel === "walking" ? "onb-card on" : "onb-card"}
              onClick={() => setTravel("walking")}
              aria-pressed={travel === "walking"}
            >
              <span className="onb-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICON.walk}</svg>
              </span>
              <div>
                <b>On foot, around here</b>
                <small>
                  No route. It finds what is near you as you go, and standing on one is what
                  syncs it.
                </small>
              </div>
            </button>
            <button
              className={travel === "driving" ? "onb-card on" : "onb-card"}
              onClick={() => setTravel("driving")}
              aria-pressed={travel === "driving"}
            >
              <span className="onb-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICON.car}</svg>
              </span>
              <div>
                <b>Driving</b>
                <small>
                  Follow a drive, or just go and see what you pass. No stopping: echoes sync
                  as you drive through them.
                </small>
              </div>
            </button>
            <button
              className={travel === "flight" ? "onb-card on" : "onb-card"}
              onClick={() => setTravel("flight")}
              aria-pressed={travel === "flight"}
            >
              <span className="onb-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICON.plane}</svg>
              </span>
              <div>
                <b>Flying</b>
                <small>
                  Your flight number builds the route. It comes down before you leave and
                  plays itself as you go over.
                </small>
              </div>
            </button>
            <button className="onb-go" onClick={next}>
              Continue
            </button>
          </>
        )}

        {/*
          Driving's own journey screen.

          A drive is not a flight and it is not a walk. There is no flight number to look up
          and no standing to do: you pick where you are going, or you pick nothing and just
          drive, and echoes sync as you pass through them. Both are hunting.
        */}
        {step === 2 && travel === "driving" && (
          <>
            <h2>Where are you driving?</h2>
            <p className="onb-lead">
              Pick a drive and it comes down with you, timed to the road. Or take nothing and
              we will find what you pass.
            </p>
            {drives.length > 0 ? (
              drives.map((drive) => (
                <button
                  key={drive.id}
                  className={picked === drive.id ? "onb-card on" : "onb-card"}
                  onClick={() => {
                    setPicked(drive.id);
                    onFlight(drive.id);
                  }}
                  aria-pressed={picked === drive.id}
                >
                  <span className="onb-ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24">{ICON.car}</svg>
                  </span>
                  <div>
                    <b>{drive.name ?? drive.id}</b>
                    <small>Downloaded before you set off, so tunnels and dead spots
                    do not matter.</small>
                  </div>
                </button>
              ))
            ) : (
              <p className="onb-sum">No drives in the library yet.</p>
            )}
            <button
              className="onb-alt onb-alt-left"
              onClick={() => {
                setPicked(null);
                onFlight(null);
                next();
              }}
            >
              No route. Just drive and find what I pass.
            </button>
            <button className="onb-go" onClick={next} disabled={!picked}>
              Take this drive
            </button>
            {/*
              Said plainly rather than mocked up, and last. Pulling a route out of Google
              Maps needs a Directions key and an account, and a button that looks like it
              does that and does not is worse than a sentence saying what is coming.
            */}
            <p className="onb-note">
              Bringing in a route from Google Maps is next, and needs a Directions key on our
              side. Until then these are the drives we have written.
            </p>
          </>
        )}

        {step === 2 && travel === "flight" && (
          <>
            <h2>Which flight are you on?</h2>
            <p className="onb-lead">
              We build the route, the pins and the running order from your flight number.
            </p>
            <input
              className="onb-field"
              value={flight}
              onChange={(e) => {
                setFlight(e.target.value);
                onFlight(lookupFlight(e.target.value));
              }}
              placeholder="Flight number, e.g. DL 411"
              autoComplete="off"
              spellCheck={false}
              aria-label="Flight number"
            />
            <button className="onb-alt onb-alt-left" onClick={next}>
              I do not have one. Pick from a list instead.
            </button>
            {matchedRoute ? (
              <div className="onb-route">
                <b>{matchedRoute.name ?? matchedRoute.id}</b>
                <span className="onb-route-line" aria-hidden="true">
                  <i />
                </span>
                <small>Found. The next screens set up what you hear on it.</small>
              </div>
            ) : (
              flight.trim().length > 2 && (
                <p className="onb-sum">
                  No route for that one yet. We only have content for a few flights while the
                  library is being written.
                </p>
              )
            )}
            <button className="onb-go" onClick={next} disabled={!matchedRoute}>
              Find my route
            </button>
          </>
        )}

        {((roaming && step === 2) || (!roaming && step === 3)) && (
          <>
            <h2>What do you want to hear?</h2>
            <p className="onb-lead">
              Pick as many as you like. You can change this any time from the map.
            </p>
            <div className="onb-chips">
              {CHIP_GROUPS.map((group) => {
                const lit = group.categories.some((c) => cats.has(c));
                return (
                  <button
                    key={group.id}
                    className={lit ? `onb-chip cat-${group.face} on` : "onb-chip"}
                    onClick={() => onToggleCats(group.categories)}
                    aria-pressed={lit}
                  >
                    <span className={`chip-dot cat-${group.face}`} />
                    {group.label}
                  </button>
                );
              })}
            </div>
            <p className="onb-sum">
              {chosenCount} of {CHIP_GROUPS.length} on
            </p>
            <button className="onb-go" onClick={next}>
              Continue
            </button>
          </>
        )}

        {((roaming && step === 3) || (!roaming && step === 4)) && (
          <>
            <h2>Who is listening?</h2>
            <p className="onb-lead">
              Kids mode hides true crime and hauntings, and leads with the shorter stories.
            </p>
            <button
              className={!kids ? "onb-card on" : "onb-card"}
              onClick={() => onKids(false)}
              aria-pressed={!kids}
            >
              <span className="onb-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICON.ear}</svg>
              </span>
              <div>
                <b>Just me</b>
                <small>Everything on the map. True crime stays off until you ask for it.</small>
              </div>
            </button>
            <button
              className={kids ? "onb-card on" : "onb-card"}
              onClick={() => onKids(true)}
              aria-pressed={kids}
            >
              <span className="onb-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICON.kid}</svg>
              </span>
              <div>
                <b>Kids with me</b>
                <small>
                  Crime and ghost stories hidden, and the shorter telling comes on with it.
                </small>
              </div>
            </button>
            <button className="onb-go" onClick={next}>
              Continue
            </button>
          </>
        )}

        {((roaming && step === 4) || (!roaming && step === 5)) && (
          <>
            <h2>Check your headphones</h2>
            <p className="onb-lead">
              Play the test line and set your volume now. Out in the street it is louder than
              it is here.
            </p>
            <div className="onb-wave" aria-hidden="true">
              {BARS.map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <button className="onb-test" onClick={onTestLine}>
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play the test line
            </button>
            <div className="onb-row">
              <div>
                <b>Simple audio</b>
                <small>Plain words, shorter. Good for kids and quick listens.</small>
              </div>
              <button
                className={simple ? "onb-sw on" : "onb-sw"}
                onClick={() => onSimple(!simple)}
                aria-pressed={simple}
                aria-label="Simple audio"
              >
                <i />
              </button>
            </div>
            <button className="onb-go" onClick={next}>
              Continue
            </button>
          </>
        )}

        {step === 5 && roaming && (
          <>
            <h2>{located === "denied" ? "No location yet" : "One permission"}</h2>
            <p className="onb-lead">
              {located === "denied"
                ? `${LOCATION.ifRefused} You can grant it later from your browser's settings.`
                : LOCATION.rationale}
            </p>
            {located !== "denied" && (
              <div className="onb-perm">
                <span className="onb-perm-ic" aria-hidden="true">
                  <svg viewBox="0 0 24 24">{ICON.pin}</svg>
                </span>
                <div>
                  <b>Only while you are using it</b>
                  <small>
                    Nothing is sent to us. Where you stood stays on your phone unless you
                    turn that on in Privacy.
                  </small>
                </div>
              </div>
            )}
            {located === null ? (
              <>
                <button className="onb-go" onClick={() => void askThenNext()} disabled={asking}>
                  {asking ? "Waiting for your answer…" : "Allow location"}
                </button>
                {/* Never disabled, even while asking. It is the way out of a prompt that
                    does not come back, and a screen with no way out is a trap. */}
                <button className="onb-alt" onClick={finish}>
                  Not yet
                </button>
              </>
            ) : (
              <button className="onb-go" onClick={finish}>
                Start looking
              </button>
            )}
          </>
        )}

        {step === 6 && !roaming && (
          <>
            <h2>Pick your journey</h2>
            <p className="onb-lead">
              Choose the flight or the walk, and carry it with you. The next screen shows what
              it weighs and downloads it.
            </p>
            <button className="onb-go" onClick={finish}>
              Choose a journey
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Value({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="onb-card onb-value">
      <span className="onb-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24">{icon}</svg>
      </span>
      <div>
        <b>{title}</b>
        <small>{children}</small>
      </div>
    </div>
  );
}
