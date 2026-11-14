/**
 * The app: the web app itself, full screen, with the phone doing what a page cannot
 * (ADR-0012, amended 2026-11-13: James required the iPhone app to be exactly the approved
 * build, screen by screen).
 *
 * The page is the deployed web app (`WEB_APP_URL`), so every screen is the approved one,
 * pixel for pixel, and a merge reaches the app as it reaches the site. Nothing native is
 * drawn over it except the approved native screens: the driving lock (`drive/DriveLock.tsx`,
 * from the root layout) and the Hands free explanation (`walk/sheet.tsx`).
 *
 * What the phone does for the page, through the messages in
 * `apps/prototype/src/native-bridge-protocol.ts` (the page's half is `native-bridge.ts`):
 *
 *   narration   the narrator (`player.tsx`): duckOthers, the lock screen, calls and
 *               headphones, with the screen locked
 *   location    expo-location, asked in the order of `docs/ios-permissions.md`; during a
 *               hands free walk, the background task (`walk/task.ts`)
 *   passes      StoreKit (`purchases/`), with the approved products; never the website's
 *               checkout
 *   links       the policies, mail and the phone's maps open outside the app
 *   hands free  Settings › Hands-free on the page starts and stops the walk
 *               (`walk/WalkProvider.tsx`), with our explanation before Always
 *
 * WHILE THE PAGE CANNOT RUN. iOS may stop the page's scripts once the screen locks. When
 * the page goes out of sight it hands over its plan (what plays, what waits, what would
 * play on arrival); the phone carries it out (the pocket, `shell/logic.ts`) and keeps
 * every fix and every player event. Back on screen the page gets them in order, comes to
 * the same echoes by the same rules, and the phone carries on with the one already
 * playing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Network from "expo-network";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import type { LocationAccess, NativeToWeb, PocketPlan, WebToNative } from "../../../prototype/src/native-bridge-protocol";
import { currentEchoes, refreshLibrary } from "../library";
import { useNarrator } from "../player";
import { usePurchases } from "../purchases/PurchasesProvider";
import { pagePrices } from "../purchases/products";
import { useWalk } from "../walk/WalkProvider";
import { attachFixes } from "../walk/task";
import { locationAccessOf } from "../walk/logic";
import {
  FixRelay,
  PocketJudge,
  PocketLedger,
  WEB_APP_URL,
  deliverScript,
  markerScript,
  navigationFor,
  offerFor,
  parseWebMessage,
  statusBarStyleFor,
  themeScript,
  type PhoneFix,
} from "./logic";

/** The page's background (`--space` in the web app's theme), so nothing ever flashes white. */
const SPACE = "#0b0f2b";

/** Messages kept while the page cannot take them; the oldest go first past this. */
const MAX_OUTBOX = 500;

function openOutside(url: string) {
  Linking.openURL(url).catch(() => {
    /* No app takes this address. */
  });
}

export default function WebShell() {
  // `WebView<object>`: the package's default props type parameter (`undefined`) makes its
  // props `never` under strict null checks.
  const web = useRef<WebView<object>>(null);
  const narrator = useNarrator();
  const purchases = usePurchases();
  const walk = useWalk();
  const router = useRouter();
  // Reloading remounts the WebView under a new key.
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);
  const failed = useRef(false);
  // The page's theme, for the status bar's text (overnight item 7). Dark until it says.
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // The page's state, as the phone sees it.
  const ready = useRef(false);
  const active = useRef(AppState.currentState === "active");
  const outbox = useRef<NativeToWeb[]>([]);
  const relay = useRef(new FixRelay());
  const ledger = useRef(new PocketLedger());
  const pocket = useRef<PocketJudge | null>(null);
  const plan = useRef<PocketPlan | null>(null);
  const watch = useRef<Location.LocationSubscription | null>(null);

  // The latest of everything, for listeners that outlive a render.
  const live = useRef({ narrator, purchases, walk });
  useEffect(() => {
    live.current = { narrator, purchases, walk };
  }, [narrator, purchases, walk]);

  /** To the page now, or kept until it can take it. */
  const send = useCallback((message: NativeToWeb) => {
    if (ready.current && active.current) {
      web.current?.injectJavaScript(deliverScript(message));
      return;
    }
    if (message.type === "audio:progress") return;
    outbox.current.push(message);
    if (outbox.current.length > MAX_OUTBOX) outbox.current.shift();
  }, []);

  /** The page can take messages again: what was kept, then where you went, in order. */
  const flush = useCallback(() => {
    if (!ready.current || !active.current) return;
    const kept = outbox.current;
    outbox.current = [];
    for (const message of kept) web.current?.injectJavaScript(deliverScript(message));
    const fixes = relay.current.drain();
    if (fixes.length > 0) web.current?.injectJavaScript(deliverScript({ type: "location:fixes", fixes }));
  }, []);

  // --- Location ------------------------------------------------------------------------------

  /** Every fix, from either watch, goes through here once. */
  const fixesArrived = useCallback(
    (raw: readonly PhoneFix[]) => {
      const fixes = relay.current.take(raw);
      if (fixes.length === 0) return;
      if (ready.current && active.current) {
        send({ type: "location:fixes", fixes });
        return;
      }
      relay.current.keep(fixes);
      // The pocket: start what the page said would play on arrival.
      const judge = pocket.current;
      if (!judge) return;
      const n = live.current.narrator;
      for (const echo of judge.update(raw)) {
        const render = echo.renders?.find((r) => r.audioKey.startsWith("audio/"));
        if (!render) continue;
        n.offerRequest({
          key: render.audioKey,
          url: new URL(`/${render.audioKey}`, WEB_APP_URL).href,
          id: echo.id,
          title: echo.title,
          place: echo.point.place,
          at: echo.point.at,
          durationS: render.durationS,
          startAtS: 0,
          rate: 1,
          muted: false,
        });
      }
      const last = fixes[fixes.length - 1]!;
      n.moved({ lat: last.lat, lng: last.lng });
    },
    [send],
  );

  useEffect(() => attachFixes((fixes) => fixesArrived(fixes)), [fixesArrived]);

  const stopWatch = useCallback(() => {
    watch.current?.remove();
    watch.current = null;
  }, []);

  /** The page asked where you are: When In Use, then a fix about every second, as Safari gives. */
  const startWatch = useCallback(async (): Promise<"granted" | "denied" | "unavailable"> => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return "denied";
      if (!watch.current) {
        const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, distanceInterval: 0 }, (fix) =>
          fixesArrived([fix]),
        );
        if (watch.current) sub.remove();
        else watch.current = sub;
      }
      return "granted";
    } catch {
      return "unavailable";
    }
  }, [fixesArrived]);

  /**
   * Location for Echo Finders, for the page's Hands free lines (mock 7): told as the page
   * loads and whenever it changes. iOS's own prompts take the app out of active and back,
   * so looking again each time it is active again catches every answer, and a change made
   * in iPhone Settings.
   */
  const lastAccess = useRef<LocationAccess | null | undefined>(undefined);
  const reportAccess = useCallback(async () => {
    try {
      const [servicesOn, whileUsing, always] = await Promise.all([
        Location.hasServicesEnabledAsync(),
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      const access = locationAccessOf(servicesOn, whileUsing, always);
      if (access === lastAccess.current) return;
      lastAccess.current = access;
      if (access) send({ type: "location:access", access });
    } catch {
      /* Asked again next time the app is on screen. */
    }
  }, [send]);

  // --- The page's messages ---------------------------------------------------------------

  const handle = useCallback(
    async (message: WebToNative) => {
      const { narrator: n, purchases: p, walk: w } = live.current;
      switch (message.type) {
        case "hello":
          ready.current = true;
          send({ type: "purchase:entitlement", entitlement: p.appStore });
          send({ type: "purchase:prices", prices: pagePrices(p.priceOf) });
          flush();
          // A page that has just loaded knows nothing yet: tell it afresh.
          lastAccess.current = undefined;
          void reportAccess();
          return;
        case "audio:play": {
          const { type: _type, ...request } = message;
          const what = ledger.current.reclaim(request.key, n.loadedKey(), Date.now());
          if (what === "ended") send({ type: "audio:ended", key: request.key });
          else if (what === "play") n.playRequest(request);
          return;
        }
        case "audio:pause":
          return n.pause();
        case "audio:resume":
          return n.resume();
        case "audio:seek":
          return n.seekFraction(message.fraction);
        case "audio:stop":
          return n.stop();
        case "audio:mute":
          return n.setSoundOn(!message.muted);
        case "audio:rate":
          return n.setRate(message.rate);
        case "location:start":
          send({ type: "reply", id: message.id, result: { status: await startWatch() } });
          void reportAccess();
          return;
        case "location:stop":
          return stopWatch();
        case "location:permission": {
          const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
          const state = !permission ? "prompt" : permission.status === "granted" ? "granted" : permission.status === "denied" ? "denied" : "prompt";
          send({ type: "reply", id: message.id, result: state });
          return;
        }
        case "purchase:buy": {
          const offer = offerFor(message.plan, message.cityId, message.upgrade === true);
          if (!offer) {
            send({ type: "reply", id: message.id, result: { outcome: "failed", message: "" } });
            return;
          }
          const result = await p.buyAndWait(offer);
          if (result.entitlement) send({ type: "purchase:entitlement", entitlement: result.entitlement });
          send({ type: "reply", id: message.id, result: { outcome: result.outcome, ...(result.message ? { message: result.message } : {}) } });
          return;
        }
        case "purchase:restore": {
          const found = await p.restoreAndRead();
          if (found) send({ type: "purchase:entitlement", entitlement: found });
          send({ type: "reply", id: message.id, result: null });
          return;
        }
        case "handsfree":
          if (!message.on) {
            if (w.mode !== "off") w.stop();
          } else if (message.changed) w.start();
          else w.resume();
          return;
        case "offline:open":
          // Settings › Offline echoes (D9, mock 3): the phone's own screen; its back link
          // says Settings and comes back here.
          router.push("/offline");
          return;
        case "settings:open":
          // Echo Finders' own page in iPhone Settings, where Location is.
          Linking.openSettings().catch(() => undefined);
          return;
        case "theme":
          setTheme(message.theme);
          return;
        case "pocket": {
          const { type: _type, ...handed } = message;
          plan.current = handed;
          n.handOver(handed.current, handed.waiting);
          pocket.current = handed.handsFree ? new PocketJudge(handed, currentEchoes(), new Date().toISOString()) : null;
          // An echo the page plays that this phone has not heard of (added after the build,
          // and since the last fetch): fetch the site's library now, while the app still
          // runs, and judge again with it if this is still the plan.
          if (handed.handsFree) {
            void refreshLibrary(handed.plays).then((newer) => {
              if (newer && plan.current === handed && !active.current) {
                pocket.current = new PocketJudge(handed, currentEchoes(), new Date().toISOString());
              }
            });
          }
          return;
        }
      }
    },
    [flush, reportAccess, router, send, startWatch, stopWatch],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWebMessage(event.nativeEvent.data);
      if (message) void handle(message);
    },
    [handle],
  );

  // What the App Store holds, whenever it changes.
  useEffect(() => {
    if (ready.current) send({ type: "purchase:entitlement", entitlement: purchases.appStore });
  }, [purchases.appStore, send]);

  // Apple's prices, once the App Store has answered.
  useEffect(() => {
    if (ready.current) send({ type: "purchase:prices", prices: pagePrices(purchases.priceOf) });
  }, [purchases.priceOf, send]);

  // The narrator's own news, for the page.
  useEffect(
    () =>
      narrator.subscribe((event) => {
        const away = !active.current;
        switch (event.type) {
          case "started":
            if (away) ledger.current.started(event.key);
            return;
          case "ended":
            if (away) ledger.current.finished(event.key);
            return send({ type: "audio:ended", key: event.key });
          case "failed":
            return send({ type: "audio:failed", key: event.key });
          case "progress":
            return send({ type: "audio:progress", key: event.key, positionS: event.positionS, durationS: event.durationS });
          case "remote":
            return send({ type: "audio:remote", action: event.action });
        }
      }),
    [narrator, send],
  );

  // The site's library, for echoes added after this build: at launch, then on screen again.
  useEffect(() => {
    void refreshLibrary();
  }, []);

  // Out of sight and back. Away, the pocket plays; back, the page has the queue again.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const wasActive = active.current;
      active.current = state === "active";
      if (active.current && !wasActive) {
        void refreshLibrary();
        void reportAccess();
        pocket.current = null;
        plan.current = null;
        live.current.narrator.takeBack();
        ledger.current.handBack(Date.now());
        flush();
      } else if (!active.current && wasActive) {
        ledger.current.clear();
      }
    });
    return () => subscription.remove();
  }, [flush, reportAccess]);

  useEffect(() => stopWatch, [stopWatch]);

  // A first launch with no signal: try again as soon as there is one.
  useEffect(() => {
    const subscription = Network.addNetworkStateListener((state) => {
      if (failed.current && state.isInternetReachable) {
        failed.current = false;
        reload();
      }
    });
    return () => subscription.remove();
  }, [reload]);

  const onShouldStart = useCallback((request: ShouldStartLoadRequest) => {
    const what = navigationFor(request.url, request.isTopFrame);
    if (what === "outside") openOutside(request.url);
    return what === "load";
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style={statusBarStyleFor(theme)} />
      <WebView<object>
        ref={web}
        key={generation}
        source={{ uri: WEB_APP_URL }}
        style={styles.web}
        containerStyle={styles.web}
        // The page knows it is in the app before its own scripts run.
        injectedJavaScriptBeforeContentLoaded={markerScript()}
        // Once it has loaded: its theme, for the status bar.
        injectedJavaScript={themeScript()}
        onMessage={onMessage}
        // Edge to edge: the page applies the safe area insets itself.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // An app, not a page: no pull to refresh, no rubber band, no swipe back.
        pullToRefreshEnabled={false}
        bounces={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        // The stand in voice and the sonar play inline; narration is the phone's.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // The camera view (Then and now) asks once for the app's own site.
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        // Location comes from the phone through the bridge, not from the WebView.
        geolocationEnabled={false}
        domStorageEnabled
        sharedCookiesEnabled
        // The app's own site is its one app bound domain (Info.plist WKAppBoundDomains),
        // which is what lets the page keep its offline copy (a service worker).
        limitsNavigationsToAppBoundDomains
        applicationNameForUserAgent="EchoFindersApp/1"
        originWhitelist={["https://*", "about:*", "blob:*", "data:*"]}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={(event) => {
          if (navigationFor(event.nativeEvent.targetUrl, true) !== "block") openOutside(event.nativeEvent.targetUrl);
        }}
        onLoadStart={() => {
          ready.current = false;
        }}
        // iOS ends the page's process under memory pressure, often with the screen locked.
        onContentProcessDidTerminate={reload}
        onError={() => {
          failed.current = true;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE },
  web: { flex: 1, backgroundColor: SPACE },
});
