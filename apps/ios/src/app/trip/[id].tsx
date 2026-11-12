/**
 * Before a drive, a walk or a flight: offer to save the route, so its echoes play where the
 * phone loses signal. Built to the approved board ("Before a drive or flight" on the
 * Download Packs canvas).
 *
 * A flight is not asked: its route starts saving the moment the trip starts, before take
 * off, "so there is nothing to remember". A route already saved starts straight away.
 *
 * Reached at `/trip/<route id>` (a deep link `echofinders://trip/<route id>` works too).
 * The native app has no trip start of its own yet; when it does, it pushes this route
 * instead of starting, and `startTrip` below is where the trip itself begins.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Route, TravelMode } from "@echofinders/core";
import { color, font, gutter, size } from "../../theme";
import { usePacks } from "../../packs/PacksProvider";
import { routeById } from "../../packs/sources";
import { echoCount, formatBytes, packIdOf, routeName } from "../../packs/plan";
import { PrimaryButton, ProgressBar, QuietButton, SAVING, SmallCaps, outline } from "../../packs/ui";

const NOUN: Record<TravelMode, string> = {
  flight: "flight",
  rail: "journey",
  driving: "drive",
  cycling: "ride",
  walking: "walk",
};

export default function TripStart() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const route = routeById(id);
  const router = useRouter();

  // TODO(trip mode): start the trip here, once the native app has one. Until then the
  // trip opens on the map.
  const startTrip = useCallback(() => router.dismissTo("/"), [router]);

  if (!route) {
    return (
      <Backdrop onDismiss={() => router.back()}>
        <Text style={styles.title}>That route is not in the library.</Text>
        <QuietButton large label="Close" onPress={() => router.back()} />
      </Backdrop>
    );
  }
  return <SaveRouteSheet route={route} onStart={startTrip} onDismiss={() => router.back()} />;
}

function SaveRouteSheet({ route, onStart, onDismiss }: { route: Route; onStart: () => void; onDismiss: () => void }) {
  const packs = usePacks();
  const source = useMemo(() => ({ kind: "route" as const, route }), [route]);
  const { plan: planOf } = packs;
  const plan = useMemo(() => planOf(source), [planOf, source]);
  const pack = packs.packById(packIdOf(source));
  const isFlight = route.mode === "flight";
  const noun = NOUN[route.mode];

  // A flight saves itself, once, as the trip starts.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (!isFlight || autoSaved.current || pack) return;
    autoSaved.current = true;
    packs.save(source);
  }, [isFlight, pack, packs, source]);

  // Already on the phone, or nothing on the way to save: nothing to ask.
  const alreadySaved = pack?.state === "saved";
  const nothingToAsk = alreadySaved || plan.echoIds.length === 0;
  useEffect(() => {
    if (nothingToAsk && !isFlight) onStart();
  }, [nothingToAsk, isFlight, onStart]);

  const count = echoCount(plan.echoIds.length);
  const facts = [count.toUpperCase(), formatBytes(plan.estimatedBytes), ...(packs.settings.wifiOnly ? ["ON WI-FI"] : [])];

  if (isFlight) {
    const progress = packs.progressOf(plan.id);
    return (
      <Backdrop onDismiss={onDismiss}>
        <SmallCaps>BEFORE YOU GO</SmallCaps>
        <Text style={styles.title} accessibilityRole="header">
          {alreadySaved ? "This flight is saved for no signal" : "Saving this flight for no signal"}
        </Text>
        <Text style={styles.body}>
          {routeName(route)} passes {count}. They are saving now, so they play once the plane is out of signal.
        </Text>
        <Facts items={facts} />
        {progress && !alreadySaved ? <ProgressBar fraction={progress.fraction} tint={SAVING} /> : null}
        <PrimaryButton large label="Start" onPress={onStart} />
      </Backdrop>
    );
  }

  return (
    <Backdrop onDismiss={onDismiss}>
      <SmallCaps>BEFORE YOU GO</SmallCaps>
      <Text style={styles.title} accessibilityRole="header">
        Save this {noun} for no signal?
      </Text>
      <Text style={styles.body}>
        {routeName(route)} passes {count}. Saving them now means they play even where your phone loses signal.
      </Text>
      <Facts items={facts} />
      <PrimaryButton
        large
        label="Save and start"
        onPress={() => {
          packs.save(source);
          onStart();
        }}
      />
      <QuietButton large label="Start without saving" onPress={onStart} />
      <Text style={styles.note}>On a flight we save the route for you before take off, so there is nothing to remember.</Text>
    </Backdrop>
  );
}

function Facts({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.facts} accessible accessibilityLabel={items.join(", ").toLowerCase()}>
      {items.map((item) => (
        <Text key={item} style={styles.fact}>
          {item}
        </Text>
      ))}
    </View>
  );
}

/** A dimmed screen with the sheet at its foot. Tapping the dim closes it. */
function Backdrop({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close" />
      <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.sheetBody}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11, 15, 43, 0.6)" },
  sheet: {
    backgroundColor: color.space,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: outline,
  },
  sheetBody: { paddingTop: 22, paddingHorizontal: gutter, paddingBottom: 24, gap: 14 },
  title: { fontFamily: font.semibold, fontSize: size.echo, lineHeight: 31, color: color.white },
  body: { fontFamily: font.regular, fontSize: size.body, lineHeight: 25, color: color.cool },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 4 },
  fact: { fontFamily: font.monoMedium, fontSize: size.secondary, color: color.muted },
  note: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 21, color: color.muted },
});
