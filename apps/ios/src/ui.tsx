/**
 * Small pieces the screens share: a screen title, the stub line for what phase 1 leaves
 * out, an echo row, and the mini player that sits above the tab bar while an echo plays.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { Echo } from "@echofinders/core";
import { CATEGORY_COLOR, CATEGORY_LABEL, color, font, gutter, size } from "./theme";
import { distanceLabel, listenLength, renderedAudio } from "./library";
import { useNarrator } from "./player";
import { PauseIcon, PlayIcon } from "./icons";

/** A tab's screen: under the status bar, with the mini player at its foot. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.body}>{children}</View>
      <MiniPlayer />
    </SafeAreaView>
  );
}

export function ScreenTitle({ children }: { children: string }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** What phase 1 leaves out, said plainly. */
export function ComingSoon({ what }: { what?: string }) {
  return (
    <View style={styles.soon}>
      {what ? <Text style={styles.soonWhat}>{what}</Text> : null}
      <Text style={styles.soonLine}>Coming in the native app.</Text>
    </View>
  );
}

/** The small capitals over an echo: its category, in its own colour. */
export function Kicker({ echo }: { echo: Echo }) {
  return (
    <View style={styles.kicker}>
      <View style={[styles.dot, { backgroundColor: CATEGORY_COLOR[echo.category] }]} />
      <Text style={[styles.kickerText, { color: CATEGORY_COLOR[echo.category] }]}>
        {CATEGORY_LABEL[echo.category]}
      </Text>
    </View>
  );
}

export function EchoRow({ echo, distanceKm, inRange }: { echo: Echo; distanceKm?: number; inRange?: boolean }) {
  const router = useRouter();
  const length = listenLength(renderedAudio(echo)?.durationS ?? echo.durationS);
  const where = inRange ? "You are here" : distanceKm !== undefined ? distanceLabel(distanceKm) : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/echo/[id]", params: { id: echo.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${echo.title}, ${echo.point.place ?? ""}, ${CATEGORY_LABEL[echo.category]}, ${length}`}
    >
      <Kicker echo={echo} />
      <Text style={styles.rowTitle}>{echo.title}</Text>
      {echo.point.place ? <Text style={styles.rowPlace}>{echo.point.place}</Text> : null}
      <Text style={styles.rowMeta}>
        {where ? <Text style={inRange ? styles.here : undefined}>{where} · </Text> : null}
        {length}
      </Text>
    </Pressable>
  );
}

/** Above the tab bar while an echo is loaded. Tap it to go back to the echo's card. */
export function MiniPlayer() {
  const { current, status, toggle } = useNarrator();
  const router = useRouter();
  if (!current) return null;
  return (
    <View style={styles.mini}>
      <Pressable
        style={styles.miniText}
        onPress={() => router.push({ pathname: "/echo/[id]", params: { id: current.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Open ${current.title}`}
      >
        <Text style={styles.miniTitle} numberOfLines={1}>
          {current.title}
        </Text>
        <Text style={styles.miniPlace} numberOfLines={1}>
          {current.point.place}
        </Text>
      </Pressable>
      <Pressable
        onPress={toggle}
        style={styles.miniButton}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause" : "Play"}
      >
        {status.playing ? <PauseIcon color={color.btnInk} size={18} /> : <PlayIcon color={color.btnInk} size={18} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.space },
  body: { flex: 1 },
  title: {
    fontFamily: font.semibold,
    fontSize: size.title,
    color: color.white,
    letterSpacing: -0.3,
    paddingHorizontal: gutter,
    paddingTop: 8,
    paddingBottom: 12,
  },
  soon: { paddingHorizontal: gutter, paddingVertical: 12 },
  soonWhat: { fontFamily: font.medium, fontSize: size.button, color: color.white, marginBottom: 4 },
  soonLine: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted },
  kicker: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kickerText: {
    fontFamily: font.monoMedium,
    fontSize: size.label,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  row: {
    marginHorizontal: gutter,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
  },
  rowPressed: { borderColor: color.line2 },
  rowTitle: { fontFamily: font.medium, fontSize: size.button, color: color.white, marginTop: 6, lineHeight: 24 },
  rowPlace: { fontFamily: font.mono, fontSize: size.secondary, color: color.muted, marginTop: 3 },
  rowMeta: { fontFamily: font.mono, fontSize: size.secondary, color: color.mutedSoft, marginTop: 6 },
  here: { color: color.aqua },
  mini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line2,
  },
  miniText: { flex: 1 },
  miniTitle: { fontFamily: font.medium, fontSize: size.secondary, color: color.white },
  miniPlace: { fontFamily: font.mono, fontSize: size.label, color: color.muted, marginTop: 2 },
  miniButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.btn,
  },
});
