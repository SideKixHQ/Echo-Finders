/**
 * The walk on the map: the button that starts one, and the bar that says one is on, how,
 * and the way to stop it. The explanation before Always is `sheet.tsx`.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { AQUA_GRADIENT, QuietButton, SmallCaps } from "../packs/ui";
import { color, font, gutter, size } from "../theme";
import { WALKING_LINE } from "./logic";
import { useWalk } from "./WalkProvider";

/** Someone walking, in the icons' line style. */
export function WalkIcon({ tint, size: px = 22 }: { tint: string; size?: number }) {
  return (
    <Svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="13" cy="4.5" r="1.8" />
      <Path d="M9 21l2.5-6.5L14 17v4M11.5 14.5 12.5 9l-3 1.5L8 13.5M12.5 9l2.5 3 3 1" />
    </Svg>
  );
}

/** On the map while no walk is on: start one. */
export function StartWalkButton({ bottom }: { bottom: number }) {
  const { mode, start } = useWalk();
  if (mode !== "off") return null;
  return (
    <Pressable
      onPress={start}
      style={({ pressed }) => [styles.start, { bottom }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Start a walk"
      accessibilityHint="Echoes start on their own as you reach them"
    >
      <WalkIcon tint={color.btnInk} />
      <Text style={styles.startText}>Start a walk</Text>
    </Pressable>
  );
}

/** On the map while a walk is on: that it is, how, and Stop. With the note, once. */
export function WalkingBar({ top }: { top: number }) {
  const { mode, note, stop, dismissNote } = useWalk();
  if (mode === "off" && !note) return null;
  return (
    <View style={[styles.bar, { top }]} accessibilityLiveRegion="polite">
      {mode !== "off" ? (
        <View style={styles.barRow}>
          <View style={styles.pulse} />
          <View style={styles.barText}>
            <SmallCaps>{mode === "hands-free" ? "WALKING · HANDS FREE" : "WALKING"}</SmallCaps>
            <Text style={styles.barLine}>{WALKING_LINE[mode]}</Text>
          </View>
          <QuietButton label="Stop" onPress={stop} accessibilityLabel="Stop the walk" />
        </View>
      ) : null}
      {note ? (
        <Pressable onPress={dismissNote} accessibilityRole="button" accessibilityHint="Hides this note">
          <Text style={[styles.note, mode !== "off" && styles.noteUnder]}>{note}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  start: {
    position: "absolute",
    left: gutter,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: color.btn,
    backgroundImage: AQUA_GRADIENT,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
  },
  startText: { fontFamily: font.semibold, fontSize: size.secondary, color: color.btnInk },
  pressed: { opacity: 0.8 },
  bar: {
    position: "absolute",
    left: gutter,
    right: gutter,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.aqua,
    shadowColor: color.aqua,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  barText: { flex: 1, gap: 2 },
  barLine: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 21, color: color.cool },
  note: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 21, color: color.white },
  noteUnder: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.line },
});
