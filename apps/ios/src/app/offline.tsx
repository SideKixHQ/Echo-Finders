/**
 * Settings › Offline echoes: what is saved on this phone, what is saving, and the places
 * you have paid for that could be. Built to the approved board ("Settings: Offline echoes"
 * on the Download Packs canvas).
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../ui";
import { color, font, gutter, size } from "../theme";
import { usePacks } from "../packs/PacksProvider";
import { paidCities } from "../packs/passes";
import { echoCount, formatBytes, formatMbPair, packIdOf, savedLine, type PackManifest } from "../packs/plan";
import {
  BackIcon,
  PrimaryButton,
  ProgressBar,
  QuietButton,
  SAVING,
  SavedIcon,
  SavingIcon,
  SmallCaps,
  hairline,
  panelFill,
} from "../packs/ui";

export default function OfflineEchoes() {
  const router = useRouter();
  const packs = usePacks();
  const { usedBytes, freeBytes } = packs.storage;
  // "saved today" is worked out against when the screen opened.
  const [now] = useState(() => Date.now());
  const usedShare = usedBytes + freeBytes > 0 ? usedBytes / (usedBytes + freeBytes) : 0;

  // Paid places not on the phone yet, each with what saving it would take.
  const { packs: saved, plan } = packs;
  const passes = useMemo(() => {
    const onPhone = new Set(saved.map((p) => p.id));
    return paidCities()
      .filter((city) => !onPhone.has(packIdOf({ kind: "city", city })))
      .map((city) => ({ city, plan: plan({ kind: "city", city }) }))
      .filter((pass) => pass.plan.echoIds.length > 0);
  }, [saved, plan]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
          style={styles.back}
          hitSlop={8}
        >
          <BackIcon />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Offline echoes
        </Text>
        <Text style={styles.lede}>
          Save a place to your phone and its echoes play with no signal: on a flight, a drive or a walk.
        </Text>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <SmallCaps>ON THIS PHONE</SmallCaps>
            <SmallCaps>{`${formatBytes(usedBytes)} OF ${formatBytes(freeBytes)} FREE`}</SmallCaps>
          </View>
          <ProgressBar fraction={usedBytes > 0 ? Math.max(0.02, usedShare) : 0} tint={color.aqua} height={6} />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Save only on Wi-Fi</Text>
            <Switch
              value={packs.settings.wifiOnly}
              onValueChange={packs.setWifiOnly}
              trackColor={{ true: color.aqua, false: hairline }}
              thumbColor={color.white}
              accessibilityLabel="Save only on Wi-Fi"
            />
          </View>
        </View>

        <SmallCaps style={styles.section}>SAVED</SmallCaps>
        {packs.packs.length === 0 ? (
          <Text style={styles.empty}>Nothing saved yet.</Text>
        ) : (
          packs.packs.map((pack) => <SavedRow key={pack.id} pack={pack} now={now} />)
        )}

        {passes.length > 0 ? (
          <>
            <SmallCaps style={styles.section}>YOUR PASSES</SmallCaps>
            {passes.map(({ city, plan }) => (
              <View key={city.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{city.name}</Text>
                  <Text style={styles.rowLine}>
                    {echoCount(plan.echoIds.length)} · {formatBytes(plan.estimatedBytes)}
                  </Text>
                </View>
                <PrimaryButton
                  label="Save"
                  accessibilityLabel={`Save ${city.name}`}
                  onPress={() => packs.save({ kind: "city", city })}
                />
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.footer}>A saved place updates itself when new echoes arrive, next time you are on Wi-Fi.</Text>
      </ScrollView>
    </Screen>
  );
}

function SavedRow({ pack, now }: { pack: PackManifest; now: number }) {
  const packs = usePacks();
  if (pack.state === "saved") {
    return (
      <View style={styles.row}>
        <SavedIcon />
        <View style={styles.rowText}>
          <Text style={styles.rowName}>{pack.name}</Text>
          <Text style={styles.rowLine}>{savedLine(pack, now)}</Text>
        </View>
        <QuietButton label="Remove" accessibilityLabel={`Remove ${pack.name}`} onPress={() => packs.remove(pack.id)} />
      </View>
    );
  }
  const progress = packs.progressOf(pack.id) ?? { savedBytes: 0, totalBytes: 0, fraction: 0 };
  const amount = formatMbPair(progress.savedBytes, progress.totalBytes);
  const line = !packs.waiting
    ? `Saving · ${amount}`
    : packs.connection === "none"
      ? `Waiting for a connection · ${amount}`
      : `Waiting for Wi-Fi · ${amount}`;
  return (
    <View style={styles.row}>
      <SavingIcon />
      <View style={[styles.rowText, styles.savingText]}>
        <Text style={styles.rowName}>{pack.name}</Text>
        <Text style={styles.rowLine}>{line}</Text>
        <ProgressBar fraction={progress.fraction} tint={SAVING} />
      </View>
      <QuietButton label="Stop" accessibilityLabel={`Stop saving ${pack.name}`} onPress={() => packs.stop(pack.id)} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: 24 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" },
  backText: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted },
  title: { fontFamily: font.semibold, fontSize: size.title, lineHeight: 37, color: color.white, marginTop: 8 },
  lede: { fontFamily: font.regular, fontSize: size.body, lineHeight: 25, color: color.cool, marginTop: 8 },
  panel: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: panelFill,
    borderWidth: 1,
    borderColor: hairline,
    gap: 8,
  },
  panelHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, gap: 12 },
  switchLabel: { fontFamily: font.regular, fontSize: size.secondary, color: color.cool },
  section: { paddingTop: 22, paddingBottom: 8 },
  empty: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted, paddingVertical: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: hairline,
  },
  rowText: { flex: 1, gap: 2 },
  savingText: { gap: 6 },
  rowName: { fontFamily: font.semibold, fontSize: size.button, color: color.white },
  rowLine: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted },
  footer: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 21, color: color.muted, marginTop: 16 },
});
