/**
 * The tab bar: Map, My echoes, Settings, as the web app has them (`Nav.tsx`). Sentence
 * case Sora at 14, muted until chosen, aqua when chosen, on the panel colour with a hair
 * line on top. Each tab screen carries the
 * mini player at its foot (`Screen` in `ui.tsx`), just above this bar.
 */
import { Tabs } from "expo-router";
import { color, font, size } from "../../theme";
import { EchoesIcon, MapIcon, SettingsIcon } from "../../icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.space },
        tabBarActiveTintColor: color.aqua,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: {
          backgroundColor: color.space,
          borderTopColor: color.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: size.label },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Map", tabBarIcon: ({ color: tint }) => <MapIcon color={tint} /> }}
      />
      <Tabs.Screen
        name="echoes"
        options={{ title: "My echoes", tabBarIcon: ({ color: tint }) => <EchoesIcon color={tint} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color: tint }) => <SettingsIcon color={tint} /> }}
      />
    </Tabs>
  );
}
