/**
 * The explanation before iOS asks for Always, in our own words (`docs/ios-permissions.md`,
 * step 2). Drawn as the save sheet before a trip is (`app/trip/[id].tsx`, the approved
 * "Download Packs" boards): navy, rounded at the top, small capitals, a Sora title, the
 * aqua primary button and the quiet one under it. Tapping the dim is "Not now".
 */
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton, QuietButton, SmallCaps, outline } from "../packs/ui";
import { color, font, gutter, size } from "../theme";
import { HANDS_FREE_SHEET } from "./logic";

export function HandsFreeSheet({ visible, onTurnOn, onNotNow }: { visible: boolean; onTurnOn: () => void; onNotNow: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onNotNow} accessibilityRole="button" accessibilityLabel={HANDS_FREE_SHEET.secondary} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetBody}>
            <SmallCaps>{HANDS_FREE_SHEET.caps}</SmallCaps>
            <Text style={styles.title} accessibilityRole="header">
              {HANDS_FREE_SHEET.title}
            </Text>
            <Text style={styles.body}>{HANDS_FREE_SHEET.body}</Text>
            <PrimaryButton large label={HANDS_FREE_SHEET.primary} onPress={onTurnOn} />
            <QuietButton large label={HANDS_FREE_SHEET.secondary} onPress={onNotNow} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
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
});
