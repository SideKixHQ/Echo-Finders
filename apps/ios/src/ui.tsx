/**
 * A native screen's frame: under the status bar, edge to edge below it. Used by the screens
 * the app draws itself (`app/offline.tsx`); everything else is the web app
 * (`shell/WebShell.tsx`).
 */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.space },
  body: { flex: 1 },
});
