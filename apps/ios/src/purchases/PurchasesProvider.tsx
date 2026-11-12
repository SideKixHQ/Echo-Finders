/**
 * Passes, for the screens: what this listener holds, what is locked, buying, restoring and
 * the Skeleton key.
 *
 *   App Store   expo-iap, StoreKit 2. On launch, on coming back to the app and after every
 *               transaction, the whole verified history (`Transaction.all`, which holds the
 *               current entitlements and the Week Passes before them) is read and mapped
 *               onto the engine's entitlement (`entitlementFromStore`). New transactions
 *               arrive through `Transaction.updates` (`purchaseUpdatedListener`), are
 *               recorded and then finished.
 *   Website     a Stripe pass found by email and receipt number (`/api/restore`), kept with
 *               its customer id and read again at each launch (`/api/entitlement`), so a
 *               renewal or a cancel on the website reaches the phone.
 *   A key       `/api/owner`, as Settings › Skeleton key on the web.
 *
 * What is locked is the engine's answer, through `isLocked` (`paywall.ts`). The free ten are
 * counted on echoes heard: an echo is heard once the narrator has it loaded.
 *
 * Inside the narrator (it records what is heard) and above the walk (which asks before it
 * hands an echo over), so both see one answer.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Linking } from "react-native";
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from "expo-iap";
import { FREE, membershipOf, type Echo, type Entitlement, type Membership } from "@echofinders/core";
import { AUDIO_ORIGIN as SITE } from "../library";
import { useNarrator } from "../player";
import { accessToStore, keyResult, parseAccess, stillTester, type KeyResult, type StoredAccess } from "./access";
import {
  entitlementFromStore,
  fromStorePurchase,
  membershipName,
  mergeEntitlements,
  parseEntitlement,
  parseHeard,
  parseWebPass,
  withAccess,
  type AccessRole,
  type StorePurchaseLike,
} from "./entitlement";
import { readJson, removeJson, writeJson } from "./files";
import { isLocked as lockedFor, type Offer } from "./paywall";
import { ALL_SKUS, WEEK_PASS_SKU, cityOfToken, cityToken } from "./products";

interface WebPass {
  readonly customerId: string;
  readonly entitlement: Entitlement;
}

interface Purchases {
  /** Everything held, from every source, with a key's everything over it. */
  readonly entitlement: Entitlement;
  readonly membership: Membership;
  /** The time the screens show passes at, epoch ms. */
  readonly now: number;
  readonly role: AccessRole | null;
  /** All-Access came from the App Store, so Apple's subscription page manages it. */
  readonly appStoreAllAccess: boolean;
  readonly heardIds: readonly string[];
  /** The engine's answer: may this echo play now? */
  readonly isLocked: (echo: Echo) => boolean;
  /** The App Store's price for a product, in the listener's currency, once it has answered. */
  readonly priceOf: (sku: string) => string | null;
  /** A purchase is on the App Store's sheet now. */
  readonly buying: boolean;
  /** Something to say after a purchase: Ask to Buy waiting, or what went wrong. */
  readonly note: string | null;
  readonly clearNote: () => void;
  readonly buy: (offer: Offer) => void;
  /** App Store restore (`AppStore.sync`). Resolves to what to say. */
  readonly restoreAppStore: () => Promise<string>;
  /** "Bought on our website?" Resolves to what to say; throws with words to show. */
  readonly restoreWebsite: (email: string, receipt: string) => Promise<string>;
  /** Apple's own page for the All-Access subscription. */
  readonly manageSubscription: () => void;
  readonly turnKey: (code: string) => Promise<KeyResult>;
  readonly removeKey: () => void;
}

const PurchasesContext = createContext<Purchases | null>(null);

function readWeekCities(): Record<string, string> {
  const raw = readJson("week-cities");
  if (typeof raw !== "object" || raw === null) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function readWebPass(): WebPass | null {
  return parseWebPass(readJson("web"));
}

/** What to say after a restore. */
function restoredLine(found: Entitlement): string {
  const membership = membershipOf(found, Date.now());
  return membership.plan === "free" ? "Nothing to restore on this Apple Account." : `Restored: ${membershipName(membership)}.`;
}

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
}

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const narrator = useNarrator();
  const [store, setStore] = useState<Entitlement>(() => parseEntitlement(readJson("store")));
  const [web, setWeb] = useState<WebPass | null>(readWebPass);
  const [access, setAccess] = useState<StoredAccess | null>(() => parseAccess(readJson("access")));
  const [heardIds, setHeardIds] = useState<readonly string[]>(() => parseHeard(readJson("heard")));
  const [prices, setPrices] = useState<Readonly<Record<string, string>>>({});
  const [buying, setBuying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // "Now" for what the screens show (a Week Pass running out, All-Access ending): moved on
  // each minute and whenever passes are read again.
  const [now, setNow] = useState(() => Date.now());
  // The city a Week Pass on the App Store's sheet now is for, in case its token is lost.
  const weekCityPending = useRef<string | null>(null);
  const connected = useRef<Promise<boolean> | null>(null);

  const connect = useCallback(() => {
    connected.current ??= initConnection().catch(() => {
      connected.current = null;
      return false;
    });
    return connected.current;
  }, []);

  /** Read the App Store's verified history again and keep what it opens. */
  const refreshStore = useCallback(async (): Promise<Entitlement | null> => {
    if (!(await connect())) return null;
    try {
      // The whole history (`Transaction.all`), not `currentEntitlements`: that keeps only the
      // latest transaction per product, and every Week Pass is one product, so a second
      // place's week, or a week bought on day six running on from the first, would vanish.
      const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
      const found = entitlementFromStore(
        purchases.map((p) => fromStorePurchase(p as unknown as StorePurchaseLike)),
        readWeekCities(),
      );
      setStore(found);
      setNow(Date.now());
      writeJson("store", found);
      return found;
    } catch {
      return null;
    }
  }, [connect]);

  // Launch: the App Store's prices and history, the website's passes, a tester's key.
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!(await connect())) return;
      try {
        const products = (await fetchProducts({ skus: [...ALL_SKUS], type: "all" })) ?? [];
        if (live) setPrices(Object.fromEntries(products.map((p) => [p.id, p.displayPrice])));
      } catch {
        /* No prices yet: the paywall says so and waits. */
      }
      await refreshStore();
    })();

    const saved = readWebPass();
    if (saved) {
      void fetch(`${SITE}/api/entitlement?customer=${encodeURIComponent(saved.customerId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json: unknown) => {
          const back = parseWebPass(json);
          if (live && back) {
            setWeb(back);
            writeJson("web", back);
          }
        })
        .catch(() => undefined);
    }

    const stored = parseAccess(readJson("access"));
    if (stored?.role === "tester" && stored.code) {
      void post("/api/owner", { code: stored.code })
        .then(({ status }) => status)
        .catch(() => null)
        .then((status) => {
          if (live && !stillTester(status)) {
            removeJson("access");
            setAccess(null);
          }
        });
    }
    return () => {
      live = false;
    };
  }, [connect, refreshStore]);

  // New transactions: bought here, renewed, Ask to Buy approved, or bought on another device.
  useEffect(() => {
    const updated = purchaseUpdatedListener((purchase: Purchase) => {
      void (async () => {
        const p = purchase as unknown as StorePurchaseLike;
        if (p.purchaseState === "pending") {
          setNote("Waiting for approval. Your pass opens as soon as it is approved.");
          setBuying(false);
          return;
        }
        if (p.productId === WEEK_PASS_SKU) {
          const city = cityOfToken(p.appAccountToken)?.id ?? weekCityPending.current;
          if (city) writeJson("week-cities", { ...readWeekCities(), [p.transactionId || p.id]: city });
        }
        weekCityPending.current = null;
        await refreshStore();
        // Finished once recorded, so StoreKit stops offering it again.
        await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
        setBuying(false);
      })();
    });
    const failed = purchaseErrorListener((error) => {
      setBuying(false);
      weekCityPending.current = null;
      if (!isUserCancelledError(error)) setNote("The App Store did not finish that. Nothing was charged. Try again in a moment.");
    });
    return () => {
      updated.remove();
      failed.remove();
    };
  }, [refreshStore]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  // Back in the app: a refund, a renewal or a cancel may have happened meanwhile.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshStore();
    });
    return () => subscription.remove();
  }, [refreshStore]);

  // Heard: once the narrator has an echo, it counts towards the free ten, once. Adjusted
  // as the narrator's echo changes, during render (React's way to follow a value), and
  // written to the phone after.
  const currentId = narrator.current?.id;
  const [seenId, setSeenId] = useState(currentId);
  if (currentId !== seenId) {
    setSeenId(currentId);
    if (currentId && !heardIds.includes(currentId)) setHeardIds([...heardIds, currentId]);
  }
  const heardWritten = useRef(heardIds);
  useEffect(() => {
    if (heardWritten.current === heardIds) return;
    heardWritten.current = heardIds;
    writeJson("heard", heardIds);
  }, [heardIds]);

  const role = access?.role ?? null;
  const entitlement = useMemo(
    () => withAccess(mergeEntitlements(store, web?.entitlement ?? FREE), role),
    [store, web, role],
  );

  const isLocked = useCallback(
    (echo: Echo) => lockedFor(entitlement, heardIds, echo, Date.now()),
    [entitlement, heardIds],
  );

  const priceOf = useCallback((sku: string) => prices[sku] ?? null, [prices]);

  const buy = useCallback(
    (offer: Offer) => {
      if (buying) return;
      setNote(null);
      setBuying(true);
      void (async () => {
        if (!(await connect())) {
          setBuying(false);
          setNote("The App Store is not answering. Try again in a moment.");
          return;
        }
        try {
          if (offer.plan === "allAccess") {
            await requestPurchase({ request: { apple: { sku: offer.sku } }, type: "subs" });
          } else {
            const token = offer.plan === "week" && offer.city ? cityToken(offer.city.id) : null;
            weekCityPending.current = offer.plan === "week" ? (offer.city?.id ?? null) : null;
            await requestPurchase({
              request: { apple: { sku: offer.sku, ...(token ? { appAccountToken: token } : {}) } },
              type: "in-app",
            });
          }
        } catch {
          // The error listener has said what happened.
          setBuying(false);
        }
      })();
    },
    [buying, connect],
  );

  const restoreAppStore = useCallback(async () => {
    if (!(await connect())) return "The App Store is not answering. Try again in a moment.";
    try {
      await restorePurchases();
    } catch (error) {
      if (isUserCancelledError(error)) return "";
    }
    const found = await refreshStore();
    if (!found) return "The App Store is not answering. Try again in a moment.";
    return restoredLine(found);
  }, [connect, refreshStore]);

  const restoreWebsite = useCallback(
    async (email: string, receipt: string) => {
      let answer: { status: number; json: unknown };
      try {
        answer = await post("/api/restore", { email: email.trim(), receipt });
      } catch {
        throw new Error("Couldn't check it, probably the connection. Try again in a moment.");
      }
      const back = answer.status === 200 ? parseWebPass(answer.json) : null;
      if (!back) {
        const said = (answer.json as { error?: unknown } | null)?.error;
        throw new Error(typeof said === "string" ? said : "That did not work. Try again.");
      }
      setWeb(back);
      writeJson("web", back);
      const membership = membershipOf(back.entitlement, Date.now());
      return membership.plan === "free" ? "That receipt has nothing open now." : `Restored: ${membershipName(membership)}.`;
    },
    [],
  );

  const manageSubscription = useCallback(() => {
    void deepLinkToSubscriptions({}).catch(() => Linking.openURL("https://apps.apple.com/account/subscriptions"));
  }, []);

  const turnKey = useCallback(async (code: string): Promise<KeyResult> => {
    const trimmed = code.trim();
    if (!trimmed) return "wrong";
    try {
      const { status, json } = await post("/api/owner", { code: trimmed });
      const result = keyResult(status, json);
      const keep = accessToStore(result, trimmed);
      if (keep) {
        writeJson("access", keep);
        setAccess(keep);
      }
      return result;
    } catch {
      return "offline";
    }
  }, []);

  const removeKey = useCallback(() => {
    removeJson("access");
    setAccess(null);
  }, []);

  const clearNote = useCallback(() => setNote(null), []);

  const value = useMemo<Purchases>(
    () => ({
      entitlement,
      membership: membershipOf(entitlement, now),
      now,
      role,
      appStoreAllAccess: store.allAccessUntil !== undefined,
      heardIds,
      isLocked,
      priceOf,
      buying,
      note,
      clearNote,
      buy,
      restoreAppStore,
      restoreWebsite,
      manageSubscription,
      turnKey,
      removeKey,
    }),
    [entitlement, now, role, store, heardIds, isLocked, priceOf, buying, note, clearNote, buy, restoreAppStore, restoreWebsite, manageSubscription, turnKey, removeKey],
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): Purchases {
  const purchases = useContext(PurchasesContext);
  if (!purchases) throw new Error("usePurchases outside PurchasesProvider");
  return purchases;
}
