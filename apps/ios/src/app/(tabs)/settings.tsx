/**
 * Settings: one honest line about location, which is the one permission this build asks
 * for (When In Use, and Always for a hands free walk), Offline echoes, Membership
 * (restore, the website's passes, Apple's subscription page), the Skeleton key, the
 * policies and a way to write to us, and which version this is.
 *
 * The web's other privacy switches have nothing to switch here. The iPhone app sends no
 * usage statistics and no error reports, so it shows no switch for either; when it does,
 * they come here, in the web's words (`apps/prototype/src/Privacy.tsx`), with the error
 * reports off by default.
 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Screen, ScreenTitle } from "../../ui";
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
          <PoliciesSection />
        </View>
        <Text style={styles.version}>{versionLine()}</Text>
      </ScrollView>
    </Screen>
  );
}

/** The policy pages the website publishes, in the web's words, and where to write to us. */
const PRIVACY_URL = "https://echofinders.com/privacy";
const TERMS_URL = "https://echofinders.com/terms";
const SUPPORT_EMAIL = "hello@echofinders.com";

function PoliciesSection() {
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        Your data
      </Text>
      <LinkRow label="Privacy policy" line="What we collect, why, and how to turn each part off." url={PRIVACY_URL} />
      <LinkRow label="Terms of service" line="Passes, renewals, safety and accuracy, in plain words." url={TERMS_URL} />
      <LinkRow label="Support" line={`Write to us at ${SUPPORT_EMAIL}.`} url={`mailto:${SUPPORT_EMAIL}`} />
    </View>
  );
}

function LinkRow({ label, line, url }: { label: string; line: string; url: string }) {
  return (
    <Pressable
      style={styles.row}
      accessibilityRole="link"
      accessibilityHint={url.startsWith("mailto:") ? "Opens Mail" : "Opens in Safari"}
      onPress={() => void Linking.openURL(url).catch(() => undefined)}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.line}>{line}</Text>
    </Pressable>
  );
}

/** Which build this is, as the App Store and TestFlight number it: "Version 1.0.0 (12)". */
function versionLine(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "";
  const build = Application.nativeBuildVersion;
  return build ? `Version ${version} (${build})` : `Version ${version}`;
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
  section: { paddingTop: 12 },
  heading: {
    fontFamily: font.monoMedium,
    fontSize: size.label,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: color.muted,
    paddingBottom: 4,
  },
  row: { paddingVertical: 12, minHeight: 44 },
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
