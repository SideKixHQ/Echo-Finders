/**
 * The app's root: fonts, the one narrator, the passes, the walk, and a stack whose first
 * screen is the web app (`app/index.tsx`, `shell/WebShell.tsx`), with the phone's own
 * screens beside it and the driving lock over everything.
 *
 * Every build starts here (`"main": "expo-router/entry"`). Since 2026-11-13 the app shows
 * the approved web app itself, and the screens rebuilt natively are gone (ADR-0012,
 * amended 2026-11-13).
 */
// The walk's background location task, defined before anything mounts: iOS can deliver a
// location update to an app it has woken in the background (`src/walk/task.ts`).
import "../walk/task";
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
import { PurchasesProvider } from "../purchases/PurchasesProvider";
import { WalkProvider } from "../walk/WalkProvider";
import { DriveLock } from "../drive/DriveLock";
// The map's planner: packs save the map's files too, so it draws with no signal.
import "../mapPacks";
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
      {/* Passes: inside the narrator (it counts what is heard), above the walk (which asks). */}
      <PurchasesProvider>
        <WalkProvider>
          <PacksProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.space } }}>
              <Stack.Screen name="index" />
              {/* Download packs: Settings › Offline echoes, and the sheet before a trip. */}
              <Stack.Screen name="offline" />
              <Stack.Screen
                name="trip/[id]"
                options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }}
              />
            </Stack>
            {/* Over everything while the phone travels faster than walking pace (`drive/`). */}
            <DriveLock />
          </PacksProvider>
        </WalkProvider>
      </PurchasesProvider>
    </NarratorProvider>
  );
}
