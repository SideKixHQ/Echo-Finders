/**
 * Settings: not in phase 1, beyond one honest line about location, which is the one
 * permission this build asks for.
 */
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Screen, ScreenTitle, ComingSoon } from "../../ui";
import { color, font, gutter, size } from "../../theme";

export default function SettingsTab() {
  return (
    <Screen>
      <ScreenTitle>Settings</ScreenTitle>
      <View style={styles.block}>
        <Text style={styles.label}>Location</Text>
        <Text style={styles.line}>
          Echo Finders uses your location only while it is open, to find the echoes nearest you. It stays on your phone.
        </Text>
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
          <Text style={styles.link}>Change in iPhone Settings</Text>
        </Pressable>
      </View>
      <ComingSoon what="Membership, privacy, listening and the rest" />
      <Text style={styles.version}>Native preview {Constants.expoConfig?.version ?? ""}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
