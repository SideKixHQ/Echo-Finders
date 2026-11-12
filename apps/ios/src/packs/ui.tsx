/**
 * The pieces the two pack screens share, drawn to the approved boards (Design canvas
 * "Download Packs"): small capitals in Space Grotesk, the aqua gradient button with teal
 * ink, the quiet outlined button, and a thin progress bar.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { color, font, size } from "../theme";

/** The aqua of the boards' buttons: #7dfff2 to #00ffe7, at 140 degrees. */
export const AQUA_GRADIENT = "linear-gradient(140deg, #7dfff2, #00ffe7)";
/** The colour a save in progress is drawn in, as the boards draw it. */
export const SAVING = "#9b95ff";
/** Panel fill and hair line, as the boards set them. */
export const panelFill = "rgba(216, 220, 229, 0.06)";
export const hairline = "rgba(216, 220, 229, 0.12)";
export const outline = "rgba(216, 220, 229, 0.22)";

export function SmallCaps({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.caps}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  large,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  large?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [large ? styles.primaryLarge : styles.primary, pressed && styles.pressed]}
    >
      <Text style={large ? styles.primaryLargeText : styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function QuietButton({
  label,
  onPress,
  large,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  large?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [large ? styles.quietLarge : styles.quiet, pressed && styles.pressed]}
    >
      <Text style={large ? styles.quietLargeText : styles.quietText}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ fraction, tint, height = 4 }: { fraction: number; tint: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={{ width: `${pct}%`, height, backgroundColor: tint }} />
    </View>
  );
}

export function SavedIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color.aqua} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="9" />
      <Path d="M8 12l3 3 5-6" />
    </Svg>
  );
}

export function SavingIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={SAVING} strokeWidth={2} strokeLinecap="round">
      <Circle cx="12" cy="12" r="9" strokeOpacity={0.3} />
      <Path d="M12 3a9 9 0 0 1 9 9" />
    </Svg>
  );
}

export function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  caps: {
    fontFamily: font.monoMedium,
    fontSize: size.label,
    letterSpacing: 0.56,
    textTransform: "uppercase",
    color: color.muted,
  },
  primary: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.btn,
    backgroundImage: AQUA_GRADIENT,
  },
  primaryText: { fontFamily: font.semibold, fontSize: size.secondary, color: color.btnInk },
  primaryLarge: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.btn,
    backgroundImage: AQUA_GRADIENT,
  },
  primaryLargeText: { fontFamily: font.semibold, fontSize: size.button, color: color.btnInk },
  quiet: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: outline,
    alignItems: "center",
    justifyContent: "center",
  },
  quietText: { fontFamily: font.regular, fontSize: size.secondary, color: color.cool },
  quietLarge: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: outline,
    alignItems: "center",
    justifyContent: "center",
  },
  quietLargeText: { fontFamily: font.regular, fontSize: size.body, color: color.cool },
  pressed: { opacity: 0.8 },
  track: { backgroundColor: hairline, overflow: "hidden" },
});
