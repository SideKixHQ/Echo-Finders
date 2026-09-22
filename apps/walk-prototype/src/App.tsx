import { useCallback, useState } from "react";
import { LIBRARY, ROUTE } from "./library.generated";
import { useWalk } from "./use-walk";
import { RouteMap, type PinState } from "./RouteMap";
import { ProximityBar } from "./ProximityBar";
import { Sheet } from "./Sheet";

export function App() {
  const { state, session, walk } = useWalk(ROUTE, LIBRARY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const stateOf = useCallback(
    (echoId: string): PinState => {
      if (state.opening.some((a) => a.echo.id === echoId)) return "opening";
      const s = session.tracker.stateOf(echoId);
      return s === "sealed" ? "sealed" : s === "heard" ? "heard" : "captured";
    },
    // `state` is included so the map redraws as captures land, even though it is not read
    // directly — the tracker it queries is mutable.
    [session, state],
  );

  const togglePause = () => {
    walk.setPaused(!paused);
    setPaused(!paused);
  };

  const walkedPercent = Math.round((walk.walkedMetres / walk.totalMetres) * 100);

  return (
    <div className="stage">
      <div className="phone">
        <div className="screen">
          <div className="statusbar">
            <span className="mono">10:42</span>
            <span className="mono dim">walking</span>
          </div>

          <RouteMap
            route={ROUTE}
            library={LIBRARY}
            position={state.position}
            opening={state.opening}
            stateOf={stateOf}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <ProximityBar guidance={state.guidance} cue={state.cue} />
          <Sheet
            nearby={state.nearby}
            lastCapture={state.lastCapture}
            captured={state.captured}
            stateOf={stateOf}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <div className="homebar" />
        </div>
      </div>

      <aside className="notes">
        <b>ECHO FINDERS · WALKING</b>
        <p>
          A simulated walk down Lower Manhattan, from Battery Park to City Hall. Everything
          you see is driven by <code>WalkSession</code> from <code>@echofinders/core</code> —
          the same code an iOS build would run. Only the GPS chip is faked.
        </p>
        <p>
          Echoes are sealed until you arrive. Step inside one and the ring fills over twelve
          seconds; when it closes, the echo opens. The bar above the sheet is the haptic made
          visible — on a phone this is a vibration you feel through a pocket.
        </p>
        <p className="dim">
          No basemap: tile providers are unreachable from this environment, and the pin
          states are the point. A real map slots in underneath unchanged.
        </p>
        <div className="controls">
          <button onClick={togglePause}>{paused ? "Resume walk" : "Pause walk"}</button>
          <button onClick={() => walk.seekTo(0)}>Back to start</button>
        </div>
        <p className="mono dim">
          {walkedPercent}% along · {state.captured.length} of {LIBRARY.length} found
        </p>
      </aside>
    </div>
  );
}
