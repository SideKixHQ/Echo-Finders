/**
 * The one time the app asks for money: an echo past the free ten, opened.
 *
 * The web paywall (`apps/prototype/src/Paywall.tsx`) in native form, with its approved
 * words and look: the count as a fact, the echo they were reaching for by name, the plans
 * as cards with the chosen one edged in ember (what is behind the wall is echoes), one sum
 * that decides between them instead of a "best value" badge, one aqua button, one way out.
 *
 * The App Store's differences: every price is the App Store's own, in the listener's
 * currency (`Product.displayPrice`); a Week Pass does not count towards a City Pass; and
 * nothing here, or anywhere in the app, points at the website's checkout.
 */
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Echo } from "@echofinders/core";
import { color, font, size } from "../theme";
import { PAYWALL_HEADING, buyLabel, heardLine, paywallFor, smallPrint, type Offer } from "./paywall";
import { usePurchases } from "./PurchasesProvider";

const EMBER_EDGE = "rgba(255, 158, 18, 0.6)";
const EMBER_FILL = "rgba(255, 158, 18, 0.06)";

export function Paywall({ echo, onClose }: { echo: Echo; onClose: () => void }) {
  const purchases = usePurchases();
  const plan = paywallFor(echo.point.at);
  const [chosenPlan, setChosenPlan] = useState(plan.chosen);
  const chosen = plan.offers.find((o) => o.plan === chosenPlan) ?? plan.offers[0]!;
  const price = purchases.priceOf(chosen.sku);
  const heard = purchases.heardIds.length;

  return (
    <View style={styles.body} accessibilityViewIsModal>
      <Text style={styles.count}>{heardLine(heard).toUpperCase()}</Text>
      <Text style={styles.heading} accessibilityRole="header">
        {PAYWALL_HEADING}
      </Text>
      <Text style={styles.next}>
        You were about to hear <Text style={styles.nextTitle}>{echo.title}</Text>
        {echo.point.place ? <Text style={styles.where}> · {echo.point.place}</Text> : null}
      </Text>

      <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel="Choose a plan">
        {plan.offers.map((offer) => (
          <PlanCard
            key={offer.plan}
            offer={offer}
            price={purchases.priceOf(offer.sku)}
            on={offer.plan === chosen.plan}
            onPress={() => setChosenPlan(offer.plan)}
          />
        ))}
      </View>

      <Text style={styles.sum}>{plan.sum}</Text>

      <Pressable
        onPress={() => purchases.buy(chosen)}
        disabled={!price || purchases.buying}
        accessibilityRole="button"
        accessibilityState={{ disabled: !price || purchases.buying, busy: purchases.buying }}
        style={({ pressed }) => [styles.buy, (!price || purchases.buying) && styles.disabled, pressed && styles.pressed]}
      >
        {purchases.buying ? (
          <ActivityIndicator color={color.btnInk} />
        ) : (
          <Text style={styles.buyText}>{buyLabel(chosen, price)}</Text>
        )}
      </Pressable>
      {!price ? <Text style={styles.note}>Waiting for prices from the App Store.</Text> : null}
      {purchases.note ? (
        <Text style={styles.note} accessibilityLiveRegion="polite">
          {purchases.note}
        </Text>
      ) : null}

      <Text style={styles.small}>
        {smallPrint(chosen.plan)}{" "}
        <Text style={styles.link} accessibilityRole="link" onPress={() => void Linking.openURL("https://echofinders.com/terms")}>
          Terms
        </Text>
        {" · "}
        <Text style={styles.link} accessibilityRole="link" onPress={() => void Linking.openURL("https://echofinders.com/privacy")}>
          Privacy
        </Text>
      </Text>

      <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
        <Text style={styles.laterText}>Not now</Text>
      </Pressable>

      <Text style={styles.keep}>Your {heard} echoes stay yours to replay.</Text>
    </View>
  );
}

function PlanCard({ offer, price, on, onPress }: { offer: Offer; price: string | null; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${offer.name}, ${price ?? ""} ${offer.per}`}
      style={[styles.plan, on && styles.planOn]}
    >
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.planText}>
        <View style={styles.planHead}>
          <Text style={styles.planName}>{offer.name}</Text>
          {price ? (
            <Text style={styles.planPrice}>
              {price} <Text style={styles.planPer}>{offer.per}</Text>
            </Text>
          ) : null}
        </View>
        {on ? <Text style={styles.planWhat}>{offer.what}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 16 },
  count: {
    fontFamily: font.mono,
    fontSize: size.label,
    letterSpacing: 1.96,
    color: color.muted,
    textAlign: "center",
    marginBottom: 12,
  },
  heading: {
    fontFamily: font.semibold,
    fontSize: size.echo,
    lineHeight: 33,
    color: color.white,
    textAlign: "center",
  },
  next: { fontFamily: font.regular, fontSize: size.body, lineHeight: 26, color: color.cool, textAlign: "center", marginTop: 10 },
  nextTitle: { fontFamily: font.medium, color: color.white },
  where: { color: color.muted },
  plans: { marginTop: 16, gap: 6 },
  plan: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    minHeight: 48,
  },
  planOn: { borderColor: EMBER_EDGE, backgroundColor: EMBER_FILL },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: color.muted,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: color.emberCore },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.emberCore },
  planText: { flex: 1 },
  planHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  planName: { fontFamily: font.semibold, fontSize: size.button, color: color.white, flexShrink: 1 },
  planPrice: { fontFamily: font.semibold, fontSize: size.button, color: color.emberCore },
  planPer: { fontFamily: font.medium, fontSize: size.secondary, color: color.cool },
  planWhat: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 22, color: color.cool, marginTop: 6 },
  sum: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 22, color: color.muted, textAlign: "center", marginTop: 10, marginBottom: 12 },
  buy: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.btn,
    paddingHorizontal: 16,
  },
  buyText: { fontFamily: font.medium, fontSize: size.button, color: color.btnInk, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  note: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 22, color: color.cool, textAlign: "center", marginTop: 10 },
  small: { fontFamily: font.regular, fontSize: size.label, lineHeight: 21, color: color.muted, textAlign: "center", marginTop: 10 },
  link: { textDecorationLine: "underline" },
  later: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  laterText: { fontFamily: font.regular, fontSize: size.button, color: color.cool },
  keep: { fontFamily: font.regular, fontSize: size.secondary, lineHeight: 22, color: color.muted, textAlign: "center", marginTop: 10 },
});
