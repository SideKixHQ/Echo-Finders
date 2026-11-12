/**
 * Settings › Membership and Settings › Skeleton key, in the web app's words
 * (`Membership.tsx`, `SkeletonKey.tsx`, `Privacy.tsx`), for the App Store:
 *
 *   - the plan line, from the merged entitlement;
 *   - Restore purchases: the App Store's own restore (`AppStore.sync`), which Apple asks
 *     every app that sells to show;
 *   - Bought on our website?: the email and receipt number from the website's receipt,
 *     checked by `/api/restore`, so a pass bought there opens here too. It restores; it
 *     never sends anybody to buy on the website;
 *   - Manage subscription: Apple's own page, for All-Access bought here;
 *   - Skeleton key: an owner, tester or App Store reviewer code, checked by `/api/owner`.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FREE_ECHO_LIMIT, freeEchoesLeft } from "@echofinders/core";
import { color, font, size } from "../theme";
import { membershipDetail, membershipName } from "./entitlement";
import { usePurchases } from "./PurchasesProvider";
import type { KeyResult } from "./access";

function day(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function MembershipSection() {
  const purchases = usePurchases();
  const { membership, role } = purchases;
  const [said, setSaid] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [email, setEmail] = useState("");
  const [receipt, setReceipt] = useState("");
  const [checking, setChecking] = useState(false);
  const freeLeft = Math.min(
    FREE_ECHO_LIMIT,
    freeEchoesLeft(purchases.entitlement, { categories: [], age: 99, heardEchoIds: purchases.heardIds }, purchases.now),
  );

  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        Membership
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>{membershipName(membership, role)}</Text>
        <Text style={styles.line}>{membershipDetail(membership, freeLeft, day, role)}</Text>
      </View>

      <Pressable
        style={styles.row}
        accessibilityRole="button"
        disabled={restoring}
        onPress={() => {
          setRestoring(true);
          setSaid(null);
          void purchases
            .restoreAppStore()
            .then((line) => setSaid(line || null))
            .finally(() => setRestoring(false));
        }}
      >
        <Text style={styles.label}>Restore purchases</Text>
        <Text style={styles.line}>Bought in the App Store before and not seeing it? This reads it back.</Text>
        {restoring ? <ActivityIndicator color={color.aqua} style={styles.spinner} /> : null}
      </Pressable>
      <Text style={styles.note} accessibilityLiveRegion="polite">
        {said ?? ""}
      </Text>

      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityState={{ expanded: elsewhere }}
        onPress={() => setElsewhere(!elsewhere)}
      >
        <Text style={styles.label}>Bought on our website?</Text>
        <Text style={styles.line}>Use the email and receipt number from your receipt.</Text>
      </Pressable>
      {elsewhere ? (
        <View style={styles.form}>
          <Text style={styles.field}>Email on the receipt</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email on the receipt"
          />
          <Text style={styles.field}>Receipt number</Text>
          <TextInput
            style={styles.input}
            value={receipt}
            onChangeText={setReceipt}
            placeholder="1234-5678"
            placeholderTextColor={color.mutedSoft}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Receipt number"
          />
          <Pressable
            style={({ pressed }) => [styles.button, (checking || !email.trim() || !receipt.trim()) && styles.disabled, pressed && styles.pressed]}
            accessibilityRole="button"
            disabled={checking || !email.trim() || !receipt.trim()}
            onPress={() => {
              setChecking(true);
              void purchases
                .restoreWebsite(email, receipt)
                .then((line) => {
                  setSaid(line);
                  setElsewhere(false);
                })
                .catch((failure: unknown) => setSaid(failure instanceof Error ? failure.message : "That did not work. Try again."))
                .finally(() => setChecking(false));
            }}
          >
            <Text style={styles.buttonText}>{checking ? "Checking…" : "Restore"}</Text>
          </Pressable>
        </View>
      ) : null}

      {membership.plan === "all-access" && purchases.appStoreAllAccess ? (
        <Pressable style={styles.row} accessibilityRole="button" onPress={purchases.manageSubscription}>
          <Text style={styles.label}>Manage subscription</Text>
          <Text style={styles.line}>Cancel or change All-Access on Apple&rsquo;s page. You keep the year already paid for.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SkeletonKeySection() {
  const purchases = usePurchases();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "trying" | KeyResult>("idle");

  if (purchases.role) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading} accessibilityRole="header">
          {purchases.role === "tester" ? "Tester mode" : "Owner mode"}
        </Text>
        <Pressable style={styles.row} accessibilityRole="button" onPress={purchases.removeKey}>
          <Text style={styles.label}>On: every echo unlocked</Text>
          <Text style={styles.line}>Only on this phone. Tap to turn it off; your key turns it back on, here under Skeleton key.</Text>
        </Pressable>
      </View>
    );
  }

  const tryKey = () => {
    setState("trying");
    void purchases.turnKey(code).then((result) => {
      setState(result);
      if (result === "owner" || result === "tester") {
        setCode("");
        setOpen(false);
      }
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        Skeleton key
      </Text>
      {open ? (
        <View style={styles.form}>
          <Text style={styles.field}>Your key</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(text) => {
              setCode(text);
              if (state === "wrong" || state === "offline") setState("idle");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            autoFocus
            onSubmitEditing={() => {
              if (code.trim() && state !== "trying") tryKey();
            }}
            accessibilityLabel="Your key"
          />
          {state === "wrong" ? <Text style={styles.error}>That key doesn&rsquo;t fit this lock.</Text> : null}
          {state === "offline" ? (
            <Text style={styles.error}>Couldn&rsquo;t check it, probably the connection. Try again in a moment.</Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              style={styles.quiet}
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                setCode("");
                setState("idle");
              }}
            >
              <Text style={styles.quietText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.button, styles.grow, (!code.trim() || state === "trying") && styles.disabled, pressed && styles.pressed]}
              accessibilityRole="button"
              disabled={!code.trim() || state === "trying"}
              onPress={tryKey}
            >
              <Text style={styles.buttonText}>{state === "trying" ? "Turning…" : "Turn the key"}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.row} accessibilityRole="button" onPress={() => setOpen(true)}>
          <Text style={styles.label}>Got a key from us?</Text>
          <Text style={styles.line}>It opens every echo, from anywhere, on this phone.</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 12 },
  heading: {
    fontFamily: font.monoMedium,
    fontSize: size.label,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: color.muted,
    paddingBottom: 4,
  },
  row: { paddingVertical: 12, minHeight: 44 },
  label: { fontFamily: font.medium, fontSize: size.button, color: color.white, marginBottom: 4 },
  line: { fontFamily: font.regular, fontSize: size.secondary, color: color.muted, lineHeight: 21 },
  note: { fontFamily: font.regular, fontSize: size.secondary, color: color.cool, lineHeight: 21 },
  spinner: { alignSelf: "flex-start", marginTop: 8 },
  form: { gap: 6, paddingBottom: 12 },
  field: { fontFamily: font.regular, fontSize: size.secondary, color: color.cool, marginTop: 6 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line2,
    paddingHorizontal: 12,
    fontFamily: font.regular,
    fontSize: size.body,
    color: color.white,
  },
  button: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.btn,
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily: font.medium, fontSize: size.button, color: color.btnInk },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  error: { fontFamily: font.regular, fontSize: size.secondary, color: color.magentaInk, marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  grow: { flex: 1 },
  quiet: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  quietText: { fontFamily: font.regular, fontSize: size.button, color: color.cool },
});
