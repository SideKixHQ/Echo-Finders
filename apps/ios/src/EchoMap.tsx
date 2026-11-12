/**
 * The map: MapLibre Native drawing the web app's navy map, the echoes on it, and you.
 *
 * The web map is the design (`apps/prototype/src/MapCanvas.tsx`, `RouteMap.tsx`,
 * `Rail.tsx`), and this follows it:
 *
 *   - the navy style over our own map files (`basemap.ts`);
 *   - every echo as a pin in its category's colour: a dark disc with a ring of the colour,
 *     a glow of it underneath and a contour outside, as `.pin-body` and `.pin-contour`
 *     draw them. The web pin carries its category's glyph in the middle; here a dot of the
 *     colour stands in for it;
 *   - you, the aqua disc with its glow;
 *   - north up, no tilt, as on the web;
 *   - the map follows you until you move it, and "Show where I am" brings it back.
 *
 * Pins are style layers, not views, so all six hundred cost what one does. A tap on one
 * opens its card (`/echo/[id]`).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type CameraRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import type { NativeSyntheticEvent } from "react-native";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { LatLng } from "@echofinders/core";
import { ECHOES, distanceLabel } from "./library";
import { nearestEchoes } from "./nearest";
import { MAP_CREDIT, nativeBasemapStyle, streetSquares } from "./basemap";
import { useWhileUsingLocation, type LocationState } from "./location";
import { useNarrator } from "./player";
import { CATEGORY_COLOR, color, font, gutter, size } from "./theme";
import { LocateIcon, SoundIcon } from "./icons";

/**
 * Camera moves are typed as returning nothing but return a promise, which rejects if the
 * map is not attached yet; either way a missed move is caught up by the next fix.
 */
function quietly(move: () => unknown) {
  try {
    Promise.resolve(move()).catch(() => undefined);
  } catch {
    // Not attached yet.
  }
}

/** Before the first fix: roughly the whole US, as the web map starts. */
const START = { center: [-98.35, 39.5] as [number, number], zoom: 3.5 };
/** On foot: the web's walking zoom (`BASE_ZOOM.walking` in `RouteMap.tsx`). */
const STREET_ZOOM = 16.5;

/** Every echo as a point, with what the pin layers draw from. Built once. */
const ECHO_POINTS: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: ECHOES.map((echo) => ({
    type: "Feature",
    id: echo.id,
    geometry: { type: "Point", coordinates: [echo.point.at.lng, echo.point.at.lat] },
    properties: { id: echo.id, colour: CATEGORY_COLOR[echo.category] },
  })),
};

const colour: ExpressionSpecification = ["get", "colour"];
/** A size that grows with zoom: a fleck across the country, a pin on the street. */
const byZoom = (z4: number, z10: number, z14: number): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  z4,
  10,
  z10,
  14,
  z14,
];

export function EchoMap() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry } = useWhileUsingLocation();
  const { soundOn, setSoundOn } = useNarrator();
  const camera = useRef<CameraRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [following, setFollowing] = useState(true);
  // Bumped by "Show where I am", so a second tap still brings the map back to you.
  const [recentre, setRecentre] = useState(0);
  const at = state.status === "located" ? state.at : null;

  // The style, once the squares are known. Until then the field alone, so nothing flashes.
  const [style, setStyle] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    streetSquares()
      .catch(() => [] as readonly string[])
      .then((squares) => {
        if (live) setStyle(JSON.stringify(nativeBasemapStyle(squares)));
      });
    return () => {
      live = false;
    };
  }, []);

  // Follow you: street level on the first fix, then keep you in the middle as you walk.
  const centred = useRef(false);
  useEffect(() => {
    if (!mapReady || !at || !following) return;
    const center: [number, number] = [at.lng, at.lat];
    if (centred.current) quietly(() => camera.current?.easeTo({ center, duration: 600 }));
    else quietly(() => camera.current?.flyTo({ center, zoom: STREET_ZOOM, duration: 1600 }));
    centred.current = true;
  }, [mapReady, at, following, recentre]);

  const showWhereIAm = useCallback(() => {
    if (state.status === "denied") {
      if (state.canAskAgain) retry();
      else void Linking.openSettings();
      return;
    }
    if (state.status === "unavailable") retry();
    centred.current = false;
    setFollowing(true);
    setRecentre((n) => n + 1);
  }, [state, retry]);

  const onReady = useCallback(() => setMapReady(true), []);
  const onUserMove = useCallback(() => setFollowing(false), []);

  const openEcho = useCallback(
    (id: string) => router.push({ pathname: "/echo/[id]", params: { id } }),
    [router],
  );

  const nearest = useMemo(() => (at ? (nearestEchoes(at, ECHOES, 1)[0] ?? null) : null), [at]);
  const mapLabel = nearest
    ? `Map of echoes. Nearest: ${nearest.echo.title}, ${nearest.inRange ? "you are here" : distanceLabel(nearest.distanceKm)}.`
    : `Map of ${ECHOES.length} echoes.`;

  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        accessible={nearest !== null}
        accessibilityLabel={mapLabel}
        accessibilityHint={nearest ? "Opens the nearest echo" : undefined}
        accessibilityRole={nearest ? "button" : undefined}
        onAccessibilityTap={nearest ? () => openEcho(nearest.echo.id) : undefined}
      >
        {style ? (
          <MapView
            mapStyle={style}
            cameraRef={camera}
            you={at}
            onReady={onReady}
            onUserMove={onUserMove}
            onEcho={openEcho}
          />
        ) : null}
      </View>

      {state.status === "denied" || state.status === "unavailable" ? (
        <LocationNote state={state} onPress={showWhereIAm} top={insets.top + 10} />
      ) : null}

      <View style={styles.rail} pointerEvents="box-none">
        <Pressable
          onPress={showWhereIAm}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityRole="button"
          accessibilityLabel="Show where I am"
          accessibilityState={{ selected: following && at !== null }}
        >
          <LocateIcon color={following && at ? color.aqua : color.cool} filled={following && at !== null} />
        </Pressable>
        <Pressable
          onPress={() => setSoundOn(!soundOn)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityRole="switch"
          accessibilityLabel="Sound"
          accessibilityState={{ checked: soundOn }}
        >
          <SoundIcon color={soundOn ? color.aqua : color.cool} on={soundOn} />
        </Pressable>
      </View>

      <Text style={styles.credit} pointerEvents="none" accessibilityRole="text">
        {MAP_CREDIT}
      </Text>
    </View>
  );
}

interface MapViewProps {
  readonly mapStyle: string;
  readonly cameraRef: React.RefObject<CameraRef | null>;
  readonly you: LatLng | null;
  readonly onReady: () => void;
  readonly onUserMove: () => void;
  readonly onEcho: (id: string) => void;
}

/**
 * The map itself, apart from the controls over it, so a tap on Sound does not hand
 * MapLibre its style again. The style is a JSON string, made once.
 */
const MapView = memo(function MapView({ mapStyle, cameraRef, you, onReady, onUserMove, onEcho }: MapViewProps) {
  const youPoint = useMemo<GeoJSON.Feature<GeoJSON.Point> | null>(
    () => (you ? { type: "Feature", geometry: { type: "Point", coordinates: [you.lng, you.lat] }, properties: {} } : null),
    [you],
  );

  return (
    <MapLibreMap
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      touchRotate={false}
      touchPitch={false}
      compass={false}
      logo={false}
      attribution={false}
      onDidFinishLoadingMap={onReady}
      onRegionWillChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
        if (e.nativeEvent.userInteraction) onUserMove();
      }}
    >
      <Camera ref={cameraRef} initialViewState={START} minZoom={2} maxZoom={19.5} />

      {/* You, under the pins: drawn, never tapped, so the echo you are standing at can
          still be opened (`.here` in the web app's theme.css). */}
      {youPoint ? (
        <GeoJSONSource id="you" data={youPoint}>
          <Layer
            id="you-glow"
            type="circle"
            paint={{ "circle-radius": 22, "circle-color": color.aqua, "circle-opacity": 0.3, "circle-blur": 1 }}
          />
          <Layer
            id="you-disc"
            type="circle"
            paint={{
              "circle-radius": 7,
              "circle-color": color.aqua,
              "circle-stroke-color": color.space,
              "circle-stroke-width": 2.5,
            }}
          />
        </GeoJSONSource>
      ) : null}

      <GeoJSONSource
        id="echoes"
        data={ECHO_POINTS}
        onPress={(e: NativeSyntheticEvent<PressEventWithFeatures>) => {
          const id = e.nativeEvent.features[0]?.properties?.id;
          if (typeof id === "string") onEcho(id);
        }}
      >
        <Layer
          id="echo-glow"
          type="circle"
          paint={{ "circle-radius": byZoom(4, 9, 16), "circle-color": colour, "circle-opacity": 0.35, "circle-blur": 1 }}
        />
        <Layer
          id="echo-contour"
          type="circle"
          minzoom={11}
          paint={{
            "circle-radius": byZoom(0, 12, 17),
            "circle-opacity": 0,
            "circle-stroke-color": colour,
            "circle-stroke-width": 1.1,
            "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 13, 0.3],
          }}
        />
        <Layer
          id="echo-body"
          type="circle"
          paint={{
            "circle-radius": byZoom(3, 7, 11),
            "circle-color": "rgba(11, 15, 43, 0.92)",
            "circle-stroke-color": colour,
            "circle-stroke-width": byZoom(1.2, 1.6, 1.8),
          }}
        />
        <Layer
          id="echo-core"
          type="circle"
          paint={{ "circle-radius": byZoom(1.2, 2.5, 3.5), "circle-color": colour }}
        />
      </GeoJSONSource>
    </MapLibreMap>
  );
});

function LocationNote({ state, onPress, top }: { state: LocationState; onPress: () => void; top: number }) {
  const denied = state.status === "denied";
  const action = denied ? (state.canAskAgain ? "Use my location" : "Open Settings") : "Try again";
  return (
    <View style={[styles.note, { top }]}>
      <Text style={styles.noteText}>
        {denied
          ? "Turn on location to see where you are among the echoes."
          : "Your location is not available right now."}
      </Text>
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.noteButton}>
        <Text style={styles.noteButtonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0D1230" },
  // Down the right hand side, at the foot of the map, as on the web (`.rail`).
  rail: { position: "absolute", right: gutter, bottom: 34, gap: 10 },
  // 52 square, 16 radius, 24px glyphs: the approved map board's two controls (`.fab`).
  fab: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
  },
  fabPressed: { borderColor: color.aqua },
  // Bottom left, clear of the controls (`.map-credit`).
  credit: {
    position: "absolute",
    left: gutter,
    bottom: 8,
    fontFamily: font.mono,
    fontSize: size.label,
    color: color.muted,
    opacity: 0.75,
    textShadowColor: color.space,
    textShadowRadius: 3,
  },
  note: {
    position: "absolute",
    left: gutter,
    right: gutter,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
  },
  noteText: { fontFamily: font.regular, fontSize: size.secondary, color: color.cool, lineHeight: 21 },
  noteButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: color.btn,
  },
  noteButtonText: { fontFamily: font.semibold, fontSize: size.secondary, color: color.btnInk },
});
