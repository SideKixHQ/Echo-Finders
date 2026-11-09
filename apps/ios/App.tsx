/**
 * The iPhone app (ADR-0012), on the same engine as the web app.
 *
 * James (2026-11-08): "this is going in the app store. people need to find it", and "Expo was
 * our strategy". This first screen only proves the chain: Expo builds it, and the engine
 * (`@echofinders/core`) answers inside it. The screens follow, one at a time.
 */
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { CITIES, FREE_ECHO_LIMIT } from "@echofinders/core";

export default function App() {
  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>ECHO FINDERS</Text>
      <Text style={styles.title}>Hear what happened right here.</Text>
      <Text style={styles.small}>
        {CITIES.length} regions · {FREE_ECHO_LIMIT} free echoes · the engine is running
      </Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1026", alignItems: "flex-start", justifyContent: "center", padding: 28 },
  wordmark: { color: "#3EF2D8", letterSpacing: 4, fontWeight: "600", fontSize: 13, marginBottom: 12 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "600", marginBottom: 12 },
  small: { color: "#9AA3C7", fontSize: 13 },
});
