/**
 * The native app's root: fonts, the one narrator, and a stack holding the three tabs with
 * an echo's card presented over them.
 *
 * Only the native build reaches this file. `index.ts` sends the WebView test shell build
 * (`EXPO_PUBLIC_SHELL=web`, the eas `production` profile) to `App.tsx` and never starts
 * the router.
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
// Each weight from its own entry, so only these five files go into the app.
import { Sora_400Regular } from "@expo-google-fonts/sora/400Regular";
import { Sora_500Medium } from "@expo-google-fonts/sora/500Medium";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { SpaceGrotesk_400Regular } from "@expo-google-fonts/space-grotesk/400Regular";
import { SpaceGrotesk_500Medium } from "@expo-google-fonts/space-grotesk/500Medium";
import { NarratorProvider } from "../player";
import { PacksProvider } from "../packs/PacksProvider";
import { color } from "../theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
  });
  // A font that fails to load falls back to the system font; the app still opens.
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <NarratorProvider>
      <PacksProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.space } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="echo/[id]" options={{ presentation: "modal" }} />
          {/* Download packs: Settings › Offline echoes, and the sheet before a trip. */}
          <Stack.Screen name="offline" />
          <Stack.Screen
            name="trip/[id]"
            options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }}
          />
        </Stack>
      </PacksProvider>
    </NarratorProvider>
  );
}
