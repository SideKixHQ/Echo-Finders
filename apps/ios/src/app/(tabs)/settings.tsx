/**
 * Settings: one honest line about location, which is the one permission this build asks
 * for (When In Use, and Always for a hands free walk), Offline echoes, Membership
 * (restore, the website's passes, Apple's subscription page) and the Skeleton key.
 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Screen, ScreenTitle, ComingSoon } from "../../ui";
import { color, font, gutter, size } from "../../theme";
import { usePacks } from "../../packs/PacksProvider";
import { echoCount } from "../../packs/plan";
import { MembershipSection, SkeletonKeySection } from "../../purchases/settings";

export default function SettingsTab() {
  return (
    <Screen>
      <ScreenTitle>Settings</ScreenTitle>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.block}>
          <Text style={styles.label}>Location</Text>
          <Text style={styles.line}>
            Echo Finders uses your location to find the echoes nearest you: while it is open, and with the screen off only during a hands free walk you start. Your exact location stays on your phone.
          </Text>
          <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
            <Text style={styles.link}>Change in iPhone Settings</Text>
          </Pressable>
        </View>
        <OfflineRow />
        <View style={styles.sections}>
          <MembershipSection />
          <SkeletonKeySection />
        </View>
        <ComingSoon what="Privacy, listening and the rest" />
        <Text style={styles.version}>Native preview {Constants.expoConfig?.version ?? ""}</Text>
      </ScrollView>
    </Screen>
  );
}

/** Settings › Offline echoes: download packs (`src/app/offline.tsx`). */
function OfflineRow() {
  const router = useRouter();
  const { packs } = usePacks();
  const saved = packs.filter((p) => p.state === "saved");
  const line =
    packs.length === 0
      ? "Save a place so its echoes play with no signal."
      : `${saved.length} ${saved.length === 1 ? "place" : "places"} saved · ${echoCount(saved.reduce((n, p) => n + p.echoIds.length, 0))}`;
  return (
    <Pressable onPress={() => router.push("/offline")} accessibilityRole="button" style={styles.block}>
      <Text style={styles.label}>Offline echoes</Text>
      <Text style={styles.line}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  sections: { paddingHorizontal: gutter },
  block: { paddingHorizontal: gutter, paddingVertical: 12 },
  label: { fontFamily: font.medium, fontSize: size.button, color: color.white, marginBottom: 4 },
  line: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted, lineHeight: 21 },
  link: { fontFamily: font.medium, fontSize: size.secondary, color: color.aqua, marginTop: 8 },
  version: {
    fontFamily: font.mono,
    fontSize: size.label,
    color: color.mutedSoft,
    paddingHorizontal: gutter,
    marginTop: 24,
  },
});
