/**
 * The driving safety lock, for the screen: a full screen notice over everything while the
 * phone is travelling faster than walking pace, with one button, "I'm a passenger". The
 * decisions are `lock.ts`; this file only feeds it and draws it.
 *
 * It never asks for location. It listens only once When In Use has been granted (the Map
 * tab asks, `location.ts`), and only while the app is on screen: a locked screen nobody can
 * see needs no lock, and a watch in the background would cost battery for nothing. It never
 * touches the narrator, so an echo playing, or a hands free walk, carries on underneath.
 *
 * A React Native `Modal`, so it sits over an echo's card and the paywall too, which the
 * stack presents above the tabs.
 */
import { useEffect, useReducer } from "react";
import { AccessibilityInfo, AppState, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { useNarrator } from "../player";
import { PrimaryButton, SmallCaps } from "../packs/ui";
import { color, font, gutter, size } from "../theme";
import { DRIVE_LOCK_COPY, DRIVE_START, asPassenger, isLocked, onFix, onTick, type DriveLockState } from "./lock";

type Action =
  | { readonly type: "fix"; readonly fix: Location.LocationObject }
  | { readonly type: "tick"; readonly nowMs: number }
  | { readonly type: "passenger" };

function reduce(state: DriveLockState, action: Action): DriveLockState {
  switch (action.type) {
    case "fix": {
      const { latitude, longitude, accuracy, speed } = action.fix.coords;
      return onFix(state, {
        at: { lat: latitude, lng: longitude },
        timestamp: action.fix.timestamp,
        accuracyM: accuracy,
        // iOS reports metres per second, and a negative speed when it does not know.
        speedKph: speed !== null && speed >= 0 ? speed * 3.6 : null,
      });
    }
    case "tick":
      return onTick(state, action.nowMs);
    case "passenger":
      return asPassenger(state);
  }
}

/** How often the clock is read with no fix, and permission looked at again. */
const TICK_MS = 15_000;

export function DriveLock() {
  const [state, dispatch] = useReducer(reduce, DRIVE_START);
  const locked = isLocked(state);
  const { current } = useNarrator();

  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    let starting = false;
    let live = true;

    const start = async () => {
      if (watch || starting) return;
      starting = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!live || permission.status !== "granted") return;
        // Accurate enough to measure speed from; every 10 m is a fix a second at 36 km/h.
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10 },
          (fix) => dispatch({ type: "fix", fix }),
        );
        if (!live || AppState.currentState !== "active") sub.remove();
        else watch = sub;
      } catch {
        /* No location: no lock. The app works as before. */
      } finally {
        starting = false;
      }
    };
    const stop = () => {
      watch?.remove();
      watch = null;
    };

    if (AppState.currentState === "active") void start();
    const changes = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        dispatch({ type: "tick", nowMs: Date.now() });
        void start();
      } else {
        stop();
      }
    });
    const clock = setInterval(() => {
      dispatch({ type: "tick", nowMs: Date.now() });
      if (AppState.currentState === "active") void start();
    }, TICK_MS);

    return () => {
      live = false;
      changes.remove();
      clearInterval(clock);
      stop();
    };
  }, []);

  useEffect(() => {
    if (locked) AccessibilityInfo.announceForAccessibility(DRIVE_LOCK_COPY.announce);
  }, [locked]);

  return (
    <Modal visible={locked} animationType="fade" presentationStyle="overFullScreen" transparent onRequestClose={() => undefined}>
      <SafeAreaView style={styles.screen} accessibilityViewIsModal>
        {/* Navy in both themes, so light text whatever the page's theme (item 7). */}
        {locked ? <StatusBar style="light" /> : null}
        <View style={styles.body}>
          <SmallCaps>{DRIVE_LOCK_COPY.caps}</SmallCaps>
          <Text style={styles.title} accessibilityRole="header">
            {DRIVE_LOCK_COPY.title}
          </Text>
          <Text style={styles.line}>{DRIVE_LOCK_COPY.body}</Text>
          {current ? (
            <Text style={styles.playing} numberOfLines={2}>
              {`Playing: ${current.title}`}
            </Text>
          ) : null}
          <Text style={styles.line}>{DRIVE_LOCK_COPY.driver}</Text>
        </View>
        <View style={styles.foot}>
          <PrimaryButton
            large
            label={DRIVE_LOCK_COPY.button}
            accessibilityLabel={`${DRIVE_LOCK_COPY.button}. ${DRIVE_LOCK_COPY.hint}`}
            onPress={() => dispatch({ type: "passenger" })}
          />
          <Text style={styles.hint}>{DRIVE_LOCK_COPY.hint}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.space, justifyContent: "space-between" },
  body: { paddingHorizontal: gutter, paddingTop: 48, gap: 14 },
  title: { fontFamily: font.semibold, fontSize: size.title, lineHeight: 40, color: color.white },
  line: { fontFamily: font.regular, fontSize: size.body, lineHeight: 26, color: color.cool },
  playing: { fontFamily: font.mono, fontSize: size.secondary, color: color.muted },
  foot: { paddingHorizontal: gutter, paddingBottom: 24, gap: 10 },
  hint: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted, textAlign: "center" },
});
