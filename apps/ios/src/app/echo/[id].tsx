/**
 * An echo's card and its player.
 *
 * The card is the web app's (`EchoPopup.tsx`): the category in small capitals and its own
 * colour, the title, the place, the length, the teaser. The player under it plays the
 * rendered narration through the app's one narrator, so it carries on when the card is
 * closed or the screen is locked, with Now Playing controls on the lock screen.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { echoById, listenLength, renderedAudio } from "../../library";
import { clock, useNarrator } from "../../player";
import { color, font, gutter, size } from "../../theme";
import { CloseIcon, PauseIcon, PlayIcon } from "../../icons";
import { Kicker } from "../../ui";

export default function EchoCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const echo = echoById(id);
  const narrator = useNarrator();

  if (!echo) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>That echo is not in the library.</Text>
      </SafeAreaView>
    );
  }

  const audio = renderedAudio(echo);
  const isCurrent = narrator.current?.id === echo.id;
  const { status } = narrator;
  const playing = isCurrent && status.playing;
  const duration = isCurrent && status.duration > 0 ? status.duration : (audio?.durationS ?? echo.durationS);
  const position = isCurrent ? status.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <Kicker echo={echo} />
          <Pressable
            onPress={() => router.back()}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <CloseIcon color={color.muted} />
          </Pressable>
        </View>
        <Text style={styles.title}>{echo.title}</Text>
        {echo.point.place ? <Text style={styles.place}>{echo.point.place}</Text> : null}
        <Text style={styles.length}>{listenLength(audio?.durationS ?? echo.durationS)}</Text>
        <Text style={styles.teaser}>{echo.teaser ?? echo.summary}</Text>

        {audio ? (
          <View style={styles.player}>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position) }}>
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={styles.times}>
              <Text style={styles.time}>{clock(position)}</Text>
              <Text style={styles.time}>{clock(duration)}</Text>
            </View>
            <View style={styles.controls}>
              <Pressable
                onPress={() => narrator.skip(-15)}
                disabled={!isCurrent}
                style={[styles.skip, !isCurrent && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel="Back 15 seconds"
              >
                <Text style={styles.skipText}>15s back</Text>
              </Pressable>
              <Pressable
                onPress={() => (isCurrent ? narrator.toggle() : narrator.play(echo))}
                style={styles.play}
                accessibilityRole="button"
                accessibilityLabel={playing ? "Pause" : "Play"}
              >
                {playing ? <PauseIcon color={color.btnInk} size={26} /> : <PlayIcon color={color.btnInk} size={26} />}
              </Pressable>
              <Pressable
                onPress={() => narrator.skip(15)}
                disabled={!isCurrent}
                style={[styles.skip, !isCurrent && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel="Forward 15 seconds"
              >
                <Text style={styles.skipText}>15s on</Text>
              </Pressable>
            </View>
            {isCurrent && status.isBuffering && !status.playing ? <Text style={styles.state}>Loading</Text> : null}
            {isCurrent && status.error ? <Text style={styles.error}>This recording would not play. Check your connection.</Text> : null}
          </View>
        ) : (
          <Text style={styles.state}>This echo has no recording yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.space },
  body: { padding: gutter, paddingTop: 20 },
  missing: { fontFamily: font.regular, fontSize: size.body, color: color.muted, padding: gutter },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  close: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
  },
  title: {
    fontFamily: font.medium,
    fontSize: size.echo,
    lineHeight: 34,
    letterSpacing: -0.26,
    color: color.white,
    marginTop: 10,
  },
  place: { fontFamily: font.mono, fontSize: size.secondary, color: color.muted, marginTop: 6 },
  length: { fontFamily: font.mono, fontSize: size.secondary, color: color.mutedSoft, marginTop: 4 },
  teaser: { fontFamily: font.regular, fontSize: size.body, lineHeight: 26, color: color.cool, marginTop: 14 },
  player: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line2,
  },
  track: { height: 4, borderRadius: 2, backgroundColor: color.line2, overflow: "hidden" },
  fill: { height: 4, backgroundColor: color.ember },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  time: { fontFamily: font.mono, fontSize: size.label, color: color.muted, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.btn,
  },
  skip: { minWidth: 88, minHeight: 44, alignItems: "center", justifyContent: "center" },
  skipText: { fontFamily: font.medium, fontSize: size.secondary, color: color.aqua },
  dim: { opacity: 0.4 },
  state: { fontFamily: font.mono, fontSize: size.secondary, color: color.muted, marginTop: 12 },
  error: { fontFamily: font.regular, fontSize: size.secondary, color: color.magentaInk, marginTop: 12 },
});
