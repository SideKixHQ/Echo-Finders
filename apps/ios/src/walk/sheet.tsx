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

/** The sheet's words: the walk's (`HANDS_FREE_SHEET`) or the drive's (`DRIVE_SHEET`, with its note). */
interface SheetWords {
  readonly caps: string;
  readonly title: string;
  readonly body: string;
  readonly primary: string;
  readonly secondary: string;
  readonly note?: string;
}

export function HandsFreeSheet({
  visible,
  onTurnOn,
  onNotNow,
  words = HANDS_FREE_SHEET,
}: {
  visible: boolean;
  onTurnOn: () => void;
  onNotNow: () => void;
  words?: SheetWords;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onNotNow} accessibilityRole="button" accessibilityLabel={words.secondary} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetBody}>
            <SmallCaps>{words.caps}</SmallCaps>
            <Text style={styles.title} accessibilityRole="header">
              {words.title}
            </Text>
            <Text style={styles.body}>{words.body}</Text>
            <PrimaryButton large label={words.primary} onPress={onTurnOn} />
            <QuietButton large label={words.secondary} onPress={onNotNow} />
            {/* The drive's note under the buttons, as the trip sheet sets its own. */}
            {words.note ? <Text style={styles.note}>{words.note}</Text> : null}
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
  note: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 21, color: color.muted },
});
