/**
 * The very first open with no signal (mock 6, approved 2026-11-13): the page has never
 * loaded, so there is no offline copy of it yet, and the shell draws this itself in place
 * of a plain navy screen. It is the web first run's own layout (`.onb`, `.fr-hero`,
 * `.fr-orb`, `.fr-words`, `.fr-go` in `apps/prototype/src/theme.css`), in its dark scheme,
 * the shell's only one: the echo, the title, the line and the aqua button, at the same
 * sizes, gaps and colours.
 *
 * The shell already loads the page by itself as soon as there is a signal; "Try again"
 * does the same at once.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Circle } from "react-native-svg";
import { color, font, size } from "../theme";

/** The approved words, verbatim (Drive-fly mocks, APPROVED). */
export const NO_SIGNAL = {
  title: "No signal yet.",
  line: "Echo Finders needs a connection the first time it opens. It opens by itself as soon as there is one.",
  button: "Try again",
} as const;

/** `.fr-orb`: 132px, and its 80px glow (`box-shadow: 0 0 80px rgba(255, 158, 18, 0.55)`). */
const ORB = 132;
const GLOW = 80;
const HALO = ORB + GLOW * 2;

export function NoSignal({ onTryAgain }: { onTryAgain: () => void }) {
  return (
    <View style={styles.screen}>
      {/* `.onb`'s ground: an ellipse of hair-white at 7% at 50% 30%, gone by 60%, over navy. */}
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="ground" cx="50" cy="30" rx="60" ry="60" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.07} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#ground)" />
      </Svg>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <Svg width={HALO} height={HALO} style={styles.orb} accessible={false}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset={ORB / HALO} stopColor="#ff9e12" stopOpacity={0.55} />
                <Stop offset="1" stopColor="#ff9e12" stopOpacity={0} />
              </RadialGradient>
              {/* `radial-gradient(circle at 35% 30%, #ffd77a, #ff9e12 60%, #c96a00)`. */}
              <RadialGradient id="orb" cx="35%" cy="30%" fx="35%" fy="30%" r="80%">
                <Stop offset="0" stopColor="#ffd77a" />
                <Stop offset="0.6" stopColor="#ff9e12" />
                <Stop offset="1" stopColor="#c96a00" />
              </RadialGradient>
            </Defs>
            <Circle cx={HALO / 2} cy={HALO / 2} r={HALO / 2} fill="url(#glow)" />
            <Circle cx={HALO / 2} cy={HALO / 2} r={ORB / 2} fill="url(#orb)" />
          </Svg>
          <View style={styles.words}>
            <Text style={styles.title} accessibilityRole="header">
              {NO_SIGNAL.title}
            </Text>
            <Text style={styles.line}>{NO_SIGNAL.line}</Text>
          </View>
        </View>
        <Pressable
          onPress={onTryAgain}
          accessibilityRole="button"
          accessibilityLabel={NO_SIGNAL.button}
          style={({ pressed }) => [styles.go, pressed && styles.pressed]}
        >
          {/* `--btn`: linear-gradient(140deg, #7dfff2, #00ffe7). */}
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="btn" x1="0" y1="0" x2="1" y2="0.84">
                <Stop offset="0" stopColor="#7dfff2" />
                <Stop offset="1" stopColor="#00ffe7" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#btn)" />
          </Svg>
          <Text style={styles.goText}>{NO_SIGNAL.button}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: color.space },
  // `.onb`: 24px 28px, and at least 40px (or the safe area and 24px) at the foot.
  safe: { flex: 1, paddingTop: 24, paddingHorizontal: 28, paddingBottom: 24, alignItems: "center" },
  // `.fr-hero`: centred in what is left, 44px between the echo and the words, 16px and 32px.
  hero: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", gap: 44, paddingTop: 16, paddingBottom: 32 },
  // The glow spills past the orb without taking room, as a box shadow does.
  orb: { marginVertical: -GLOW, marginHorizontal: -GLOW },
  // `.fr-words`: 16px apart, centred.
  words: { alignItems: "center", gap: 16 },
  // `.fr-words h1`: the title size, 1.15, -0.02em. The site loads Sora up to 600, so 600 is drawn.
  title: {
    fontFamily: font.semibold,
    fontSize: size.title,
    lineHeight: Math.round(size.title * 1.15),
    letterSpacing: -0.02 * size.title,
    color: color.white,
    textAlign: "center",
  },
  // `.fr-words p`: the button size, cool.
  line: { fontFamily: font.regular, fontSize: size.button, lineHeight: 23, color: color.cool, textAlign: "center" },
  // `.fr-go`: 60px tall, 18px round, full width to 420px.
  go: {
    width: "100%",
    maxWidth: 420,
    minHeight: 60,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  goText: { fontFamily: font.semibold, fontSize: size.button, color: color.btnInk },
  pressed: { opacity: 0.85 },
});
