/**
 * The Map tab, phase 1: the echoes nearest you, as a list. The map itself is phase 2.
 *
 * With location: nearest first, by the engine's distance, with "You are here" inside an
 * echo's own trigger radius. Without it (refused, or not yet answered): the whole library,
 * so there is still something to open and play.
 */
import { useMemo } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Echo } from "@echofinders/core";
import { ECHOES } from "../../library";
import { nearestEchoes } from "../../nearest";
import { useWhileUsingLocation, type LocationState } from "../../location";
import { color, font, gutter, size } from "../../theme";
import { EchoRow, Screen, ScreenTitle } from "../../ui";

interface Row {
  readonly echo: Echo;
  readonly distanceKm?: number;
  readonly inRange: boolean;
}

export default function MapTab() {
  const { state, retry } = useWhileUsingLocation();
  const at = state.status === "located" ? state.at : null;
  const rows = useMemo<readonly Row[]>(
    () =>
      at
        ? nearestEchoes(at, ECHOES)
        : [...ECHOES].sort((a, b) => a.title.localeCompare(b.title)).map((echo) => ({ echo, inRange: false })),
    [at],
  );

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.echo.id}
        ListHeaderComponent={
          <View>
            <ScreenTitle>Map</ScreenTitle>
            <Text style={styles.note}>The map is coming in the native app. For now, the echoes nearest you.</Text>
            <LocationLine state={state} retry={retry} />
          </View>
        }
        renderItem={({ item }) => <EchoRow echo={item.echo} distanceKm={item.distanceKm} inRange={item.inRange} />}
        contentContainerStyle={styles.list}
        initialNumToRender={8}
      />
    </Screen>
  );
}

function LocationLine({ state, retry }: { state: LocationState; retry: () => void }) {
  switch (state.status) {
    case "located":
      return <Text style={styles.section}>Nearest to you</Text>;
    case "asking":
      return <Text style={styles.section}>Finding where you are</Text>;
    case "unavailable":
      return (
        <View style={styles.ask}>
          <Text style={styles.askText}>Your location is not available right now, so these are in title order.</Text>
          <Pressable onPress={retry} accessibilityRole="button" style={styles.askButton}>
            <Text style={styles.askButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    case "denied":
      return (
        <View style={styles.ask}>
          <Text style={styles.askText}>
            Turn on location to see the echoes nearest you. Until then, these are in title order.
          </Text>
          <Pressable
            onPress={state.canAskAgain ? retry : () => void Linking.openSettings()}
            accessibilityRole="button"
            style={styles.askButton}
          >
            <Text style={styles.askButtonText}>{state.canAskAgain ? "Use my location" : "Open Settings"}</Text>
          </Pressable>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  list: { paddingBottom: 16 },
  note: {
    fontFamily: font.regular,
    fontSize: size.secondary,
    color: color.muted,
    paddingHorizontal: gutter,
    marginBottom: 14,
    lineHeight: 21,
  },
  section: {
    fontFamily: font.monoMedium,
    fontSize: size.label,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: color.muted,
    paddingHorizontal: gutter,
    marginBottom: 10,
  },
  ask: { marginHorizontal: gutter, marginBottom: 14 },
  askText: { fontFamily: font.regular, fontSize: size.secondary, color: color.cool, lineHeight: 21 },
  askButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: color.btn,
  },
  askButtonText: { fontFamily: font.semibold, fontSize: size.secondary, color: color.btnInk },
});
