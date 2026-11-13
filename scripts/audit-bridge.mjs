#!/usr/bin/env node
/**
 * The web app inside the iPhone app, with a stand in for the phone (ADR-0012, amended
 * 2026-11-13; `apps/prototype/src/native-bridge.ts`).
 *
 *   npm run audit:bridge
 *
 * The iPhone app shows the deployed web app in a WebView and plays, locates and sells for
 * it. This drives the built app twice:
 *
 *   in a browser    nothing of the bridge is installed, and the screens are the same pixels
 *                   as with it (Settings, compared byte for byte)
 *   in "the app"    a recording `window.ReactNativeWebView` and the app's marker: narration
 *                   goes to the phone, the phone's fixes move the map, buying and restoring
 *                   go to the App Store and never to the website's checkout, the lock
 *                   screen's buttons reach the page, Hands-free is reported, the plan is
 *                   handed over when the page hides, and the offline copy opens with no
 *                   network
 *
 * What only a phone can show (the WebView, the background, the App Store sheet) is listed
 * in the ADR amendment.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4181;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BATTERY = { lat: 40.70556, lng: -74.01705 };
const PHILADELPHIA = { lat: 39.9496, lng: -75.1503 };
const SHARED = 'wilmington-the-first-curtain';
const SHOTS = process.env.BRIDGE_SHOTS ?? '';

spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${ORIGIN}/`)).ok) break; } catch {}
  await sleep(500);
}

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});
const failures = [];
const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures.push(name);
};
const visible = async (loc) => (await loc.count()) > 0 && await loc.first().isVisible();

/**
 * The phone, as the page sees it: a `ReactNativeWebView` that records every message, and
 * answers the ones that wait for an answer as the iPhone app does.
 */
function phone() {
  return ({ marker, sw, at }) => {
    if (marker) window.__EF_SHELL__ = { v: 1, sw };
    window.__sent = [];
    window.__at = at;
    const send = (message) => window.__echoFindersNative.receive(message);
    window.__send = send;
    const reply = (id, result) => setTimeout(() => send({ type: 'reply', id, result }), 10);
    window.ReactNativeWebView = {
      postMessage(data) {
        const m = JSON.parse(data);
        window.__sent.push(m);
        if (m.type === 'location:permission') reply(m.id, 'granted');
        if (m.type === 'location:start') {
          reply(m.id, { status: 'granted' });
          clearInterval(window.__fixes);
          const fix = () => send({ type: 'location:fixes', fixes: [{ ...window.__at, accuracyM: 5, headingDeg: null, speedMps: 0, timestamp: Date.now() }] });
          setTimeout(fix, 30);
          window.__fixes = setInterval(fix, 1000);
        }
        if (m.type === 'location:stop') clearInterval(window.__fixes);
        if (m.type === 'purchase:buy') {
          setTimeout(() => {
            send({ type: 'purchase:entitlement', entitlement: { kind: 'passes', purchasedAt: Date.now(), allAccessUntil: Date.now() + 365 * 864e5 } });
            reply(m.id, { outcome: 'bought' });
          }, 20);
        }
        if (m.type === 'purchase:restore') reply(m.id, null);
      },
    };
  };
}

async function open({ bridge = null, path = '/', geolocation = { latitude: BATTERY.lat, longitude: BATTERY.lng }, offlineReady = false } = {}) {
  const ctx = await browser.newContext({ colorScheme: 'dark',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation,
    serviceWorkers: offlineReady ? 'allow' : 'block',
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  if (bridge) await ctx.addInitScript(phone(), { marker: true, sw: false, at: BATTERY, ...bridge });
  const requests = [];
  ctx.on('request', (r) => requests.push(r.url()));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  return { ctx, p, requests };
}

async function firstRun(p) {
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(1500);
}

const sent = (p, type) => p.evaluate((type) => window.__sent.filter((m) => m.type === type), type);

async function settingsShot(p) {
  await p.locator('.nav').getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(800);
  return p.screenshot();
}

// ── In a browser: nothing installed ─────────────────────────────────────────────
let browserSettings = null;
{
  const { ctx, p } = await open();
  const state = await p.evaluate(() => ({
    receiver: typeof window.__echoFindersNative,
    geolocation: Object.getOwnPropertyDescriptor(navigator, 'geolocation') === undefined,
    mediaSession: Object.getOwnPropertyDescriptor(navigator, 'mediaSession') === undefined,
  }));
  check('Browser: no receiver for the phone', state.receiver === 'undefined');
  check('Browser: the browser\'s own geolocation', state.geolocation);
  check('Browser: the browser\'s own media session', state.mediaSession);
  await firstRun(p);
  browserSettings = await settingsShot(p);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/bridge-settings-browser.png` });
  await ctx.close();
}

// ── Another app's WebView, without the iPhone app's marker: still a browser ──────
{
  const { ctx, p } = await open({ bridge: { marker: false } });
  await firstRun(p);
  check('Other WebView: nothing sent without the app\'s marker', (await p.evaluate(() => window.__sent.length)) === 0);
  check('Other WebView: the page\'s own geolocation', await p.evaluate(() => Object.getOwnPropertyDescriptor(navigator, 'geolocation') === undefined));
  await ctx.close();
}

// ── In the app: the same pixels, location from the phone, hands-free ─────────────
{
  const { ctx, p } = await open({ bridge: {} });
  check('App: says hello', (await sent(p, 'hello')).length === 1);
  check('App: reports Hands-free as it loads, without asking', JSON.stringify(await sent(p, 'handsfree')) === JSON.stringify([{ type: 'handsfree', on: false, changed: false }]));
  await firstRun(p);
  check('App: location asked of the phone', (await sent(p, 'location:start')).length >= 1);
  const here = () => p.locator('.here').first().boundingBox().catch(() => null);
  const kindsHead = async () => {
    await p.locator('.kind-tap').click();
    await p.waitForTimeout(400);
    const text = (await p.locator('#kind-box .kind-head').innerText().catch(() => '')).trim();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    return text;
  };
  check('App: the phone\'s fix puts you on the map', !!(await here()));
  const appSettings = await settingsShot(p);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/bridge-settings-app.png` });
  check('App: Settings is the same pixels as in a browser', !!browserSettings && Buffer.compare(browserSettings, appSettings) === 0);
  await p.locator('.nav').getByRole('button', { name: /Map/ }).click();
  await p.waitForTimeout(800);
  const ny = await kindsHead();
  await p.evaluate((at) => { window.__at = at; }, PHILADELPHIA);
  await p.waitForTimeout(3500);
  const philly = await kindsHead();
  check('App: the phone\'s next fix moves the map', !/Philadelphia/i.test(ny) && /Philadelphia/i.test(philly), `${ny} then ${philly}`);

  await p.locator('.nav').getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(600);
  await p.getByRole('switch', { name: /Hands-free/ }).click();
  await p.waitForTimeout(900);
  const hands = await sent(p, 'handsfree');
  check('App: Hands-free switched on reaches the phone, as a change', JSON.stringify(hands.at(-1)) === JSON.stringify({ type: 'handsfree', on: true, changed: true }));

  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pocket = (await sent(p, 'pocket')).at(-1);
  check('App: going out of sight hands the phone the plan',
    !!pocket && pocket.handsFree === true && typeof pocket.mode === 'string' && Array.isArray(pocket.plays) && Array.isArray(pocket.captured) && Array.isArray(pocket.waiting),
    JSON.stringify(pocket)?.slice(0, 200));
  // Play on arrival is off until the listener turns it on (`use-journey.ts`), so the engine
  // says nothing starts by itself, and the plan says the same.
  check('App: the plan is the engine\'s answer (mode, and nothing plays on arrival by default)', pocket?.mode === 'walking' && pocket.plays.length === 0, `${pocket?.mode} ${pocket?.plays.length}`);
  await ctx.close();
}

// ── In the app: narration goes to the phone ─────────────────────────────────────
{
  const { ctx, p } = await open({ bridge: {}, path: `/?echo=${SHARED}` });
  await firstRun(p);
  const card = p.locator('.pop');
  await card.getByRole('button', { name: 'Play', exact: true }).click();
  await p.waitForTimeout(800);
  const play = (await sent(p, 'audio:play')).at(-1);
  check('Audio: Play goes to the phone, with the file and the lock screen words',
    !!play && play.key.startsWith(`audio/${SHARED}/`) && play.url === `${ORIGIN}/${play.key}` && /First Curtain/.test(play.title) && play.place.length > 0,
    JSON.stringify(play));
  check('Audio: the page plays no file itself', await p.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused)));
  await p.evaluate(() => window.__send({ type: 'audio:remote', action: 'pause' }));
  await p.waitForTimeout(400);
  check('Audio: Pause on the lock screen pauses the page\'s player, and the phone hears it', (await sent(p, 'audio:pause')).length >= 1);
  await p.evaluate(() => window.__send({ type: 'audio:remote', action: 'play' }));
  await p.waitForTimeout(400);
  check('Audio: Play on the lock screen resumes it', (await sent(p, 'audio:resume')).length >= 1);
  const before = (await sent(p, 'audio:stop')).length;
  await p.evaluate((key) => window.__send({ type: 'audio:ended', key }), play?.key);
  await p.waitForTimeout(800);
  check('Audio: the phone saying it ended is the end (no stop sent back)', (await sent(p, 'audio:stop')).length === before);
  check('Audio: a finished echo can be played again', await visible(p.getByRole('button', { name: /Play it again|Play/ })));
  await ctx.close();
}

// ── In the app: buying and restoring go to the App Store ─────────────────────────
{
  const { ctx, p, requests } = await open({ bridge: {} });
  await firstRun(p);
  await p.locator('.nav').getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(400);
  const panel = p.locator('.membership');
  await panel.getByRole('button', { name: /Membership options/ }).click();
  await p.waitForTimeout(400);
  const sheet = p.getByRole('dialog', { name: 'Membership options' });
  await sheet.locator('label', { hasText: 'All-Access' }).click();
  await sheet.getByRole('button', { name: /Start All-Access/ }).click();
  await p.waitForTimeout(600);
  const buy = (await sent(p, 'purchase:buy')).at(-1);
  check('Buy: goes to the App Store', buy?.plan === 'allAccess' && buy.cityId === undefined, JSON.stringify(buy));
  check('Buy: never the website\'s checkout', !requests.some((u) => u.includes('/api/checkout') || u.includes('stripe.com')));
  check('Buy: what the App Store holds shows in Membership', /All-Access/.test(await panel.locator('.membership-plan').textContent() ?? ''));
  check('Buy: the plans close once bought', !(await visible(sheet)));
  check('Buy: nothing recorded on this phone as if bought here', await p.evaluate(() => localStorage.getItem('echo-finders:entitlement') === null));
  await panel.getByRole('button', { name: /Restore purchases/ }).click();
  await p.waitForTimeout(500);
  check('Restore: asks the App Store', (await sent(p, 'purchase:restore')).length === 1);
  check('Restore: says what is held, App Store included', /All-Access/.test(await panel.getByRole('status').textContent().catch(() => '') ?? ''));
  await ctx.close();
}

// ── In the app: a launch with no signal opens the kept copy ──────────────────────
{
  const { ctx, p } = await open({ bridge: { sw: true }, offlineReady: true });
  await p.evaluate(() => navigator.serviceWorker.ready);
  check('Offline: the app registers its copy', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/'))));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1500);
  check('Offline: the app opens with no network', await visible(p.getByRole('button', { name: 'Find echoes near me' })));
  await ctx.close();
}
{
  const { ctx, p } = await open({ offlineReady: true });
  await p.waitForTimeout(800);
  check('Offline: a browser registers nothing', await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0));
  await ctx.close();
}

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? errors.join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('bridge: the page is the page, and the phone does the rest');
process.exit(0);
