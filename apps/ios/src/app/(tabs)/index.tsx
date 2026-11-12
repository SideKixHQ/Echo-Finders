/**
 * The Map tab: the navy map with every echo on it and you among them (`src/EchoMap.tsx`),
 * edge to edge under the status bar, with the mini player at its foot while an echo plays.
 *
 * It asks for When In Use location when it first opens, not at launch
 * (`src/location.ts`). Refused, the map still shows every echo, and a note offers to turn
 * location on.
 */
import { StyleSheet, View } from "react-native";
import { EchoMap } from "../../EchoMap";
import { MiniPlayer } from "../../ui";
import { color } from "../../theme";

export default function MapTab() {
  return (
    <View style={styles.screen}>
      <EchoMap />
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.space },
});
