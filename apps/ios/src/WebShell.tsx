/**
 * The TestFlight test shell: the live web app in a WebView (ADR-0012, amendment of
 * 2026-11-11). It is for testing on a phone only and never the App Store app. The native
 * screens replace this component; App.tsx renders it and nothing else depends on it.
 *
 * What it does for a walk:
 *   - location: the page's own `navigator.geolocation`, which iOS allows because the app
 *     carries `NSLocationWhenInUseUsageDescription` (app.json);
 *   - audio with the screen locked: the `audio` background mode plus an audio session set
 *     to play in the background and through the silent switch;
 *   - the safe area: the page is edge to edge and pads itself with `env(safe-area-inset-*)`
 *     (it declares `viewport-fit=cover`), exactly as it does from the home screen;
 *   - links off the app's own host (echofinders.com policies, Stripe checkout) open in Safari.
 */
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

export const WEB_APP_URL = "https://echo-finders.vercel.app/";
const WEB_APP_HOST = new URL(WEB_APP_URL).host;

/** The page's background (`--space` in the web app's theme), so nothing ever flashes white. */
const SPACE = "#0b0f2b";

/** Schemes the WebView handles itself rather than handing to iOS. */
const INTERNAL_SCHEMES = new Set(["about:", "blob:", "data:", "javascript:"]);

/** True when a top frame navigation to `url` belongs in Safari (or another app) instead. */
export function opensOutside(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (INTERNAL_SCHEMES.has(parsed.protocol)) return false;
  if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.host !== WEB_APP_HOST;
  return true; // mailto:, tel:, maps: and the like
}

function openOutside(url: string) {
  Linking.openURL(url).catch(() => {
    /* No app takes this URL. Nothing useful to do in a test shell. */
  });
}

export default function WebShell() {
  // Reloading remounts the WebView under a new key, which needs no ref into it.
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Narration keeps playing with the screen locked and with the silent switch on.
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
    }).catch(() => {
      /* The page still plays in the foreground without it. */
    });
  }, []);

  const onShouldStart = useCallback((request: ShouldStartLoadRequest) => {
    // Frames inside the page (map tiles, embeds) load where they are.
    if (!request.isTopFrame) return true;
    if (!opensOutside(request.url)) return true;
    openOutside(request.url);
    return false;
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    reload();
  }, [reload]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <WebView
        key={generation}
        source={{ uri: WEB_APP_URL }}
        style={styles.web}
        containerStyle={styles.web}
        // Edge to edge: the page applies the safe area insets itself.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // Feels like an app, not a page: no pull to refresh, no rubber band, no swipe back.
        pullToRefreshEnabled={false}
        bounces={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        // Audio: inline, without a tap where iOS allows it, and on to AirPlay.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsAirPlayForMediaPlayback
        // The camera view asks once per host rather than on every visit.
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        // Location and storage behave as they do in Safari.
        geolocationEnabled
        domStorageEnabled
        sharedCookiesEnabled
        applicationNameForUserAgent="EchoFindersTestShell/1"
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={(event) => openOutside(event.nativeEvent.targetUrl)}
        // iOS kills the web process under memory pressure, often while the screen is locked.
        onContentProcessDidTerminate={reload}
        onError={() => setFailed(true)}
        onLoadStart={() => setFailed(false)}
      />
      {failed && (
        <View style={styles.failed}>
          <Text style={styles.title}>Echo Finders could not load.</Text>
          <Text style={styles.small}>Check your connection, then try again.</Text>
          <Pressable onPress={retry} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE },
  web: { flex: 1, backgroundColor: SPACE },
  failed: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SPACE,
    alignItems: "flex-start",
    justifyContent: "center",
    padding: 28,
  },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "600", marginBottom: 10 },
  small: { color: "#9AA3C7", fontSize: 15, marginBottom: 24 },
  button: { backgroundColor: "#3EF2D8", borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22 },
  buttonText: { color: SPACE, fontSize: 15, fontWeight: "600" },
});
