#!/usr/bin/env node
/**
 * Drives and flights, run in the built app (the plan James approved on 2026-11-13).
 *
 *   npm run audit:journeys
 *
 * Each check is one of the plan's items, written to fail on the app as it was before the
 * item was built and pass after. The engine's half of each item is tested in
 * `packages/core`; this is the half only a page can show.
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4183;
const BATTERY = { latitude: 40.70556, longitude: -74.01705 };
/** The MVP drive's start, the Cotton Exchange: a journey screen only offers routes near you. */
const WILMINGTON = { latitude: 34.23979, longitude: -77.94958 };

// `JOURNEYS_DIST=<dir>` serves a build made elsewhere (the app before a change) unbuilt.
const DIST = process.env.JOURNEYS_DIST;
// A failed build would leave the last one in `dist` to be audited instead, and pass.
if (!DIST && spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' }).status !== 0) {
  console.log('FAIL  the app does not build (npm run build -w @echofinders/prototype)');
  process.exit(1);
}
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort',
  ...(DIST ? ['--outDir', DIST] : [])],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});
/** `JOURNEYS_ONLY=F1,D2` runs those items alone, while working on one. */
const ONLY = process.env.JOURNEYS_ONLY?.split(',');
const want = (item) => !ONLY || ONLY.includes(item);
const failures = [];
const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures.push(name);
};

async function freshApp(geolocation = BATTERY, path = '/') {
  const ctx = await browser.newContext({ colorScheme: 'dark',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation,
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(1500);
  return { ctx, p };
}

/** Open the trip sheet on a mode's tab, with every route listed. */
async function tripSheet(p, mode) {
  await p.getByLabel(/Change your journey/).click();
  await p.waitForTimeout(400);
  await p.locator('.jmenu-mode', { hasText: mode }).click();
  await p.waitForTimeout(300);
  const far = p.locator('.jmenu-far');
  if ((await far.count()) && (await far.getAttribute('aria-expanded')) === 'false') await far.click();
  await p.waitForTimeout(200);
}

const MVP_DRIVE = 'Wilmington to Southport';

// ── D1: the road trips list counts echoes, not stops ────────────────────────────────
// The MVP drive was listed as "3 echoes": its stops. The drive plays the 25 it passes,
// which is what its journey screen says.
if (want('D1')) {
  const { ctx, p } = await freshApp(WILMINGTON);
  await tripSheet(p, 'Drive');
  const row = (await p.locator('.jmenu-item', { hasText: MVP_DRIVE }).innerText()).replace(/\s+/g, ' ');
  const listed = Number(/(\d+) echoe?s?/.exec(row)?.[1] ?? NaN);
  await p.locator('.jmenu-item', { hasText: MVP_DRIVE }).click();
  await p.waitForTimeout(800);
  await tripSheet(p, 'Drive');
  await p.locator('.jmenu-link', { hasText: 'Journey details' }).click();
  await p.waitForTimeout(800);
  const pkg = await p.locator('.pf-pkg-text').innerText().catch(() => '');
  const counted = Number(/(\d+) echoe?s?/.exec(pkg)?.[1] ?? NaN);
  check('D1: a road trip is listed with the echoes it plays, as its journey screen counts them',
    listed > 3 && listed === counted, `listed "${row}", journey screen "${pkg}"`);
  await ctx.close();
}

/** Pick the MVP drive from the trip sheet. */
async function startDrive(p) {
  await tripSheet(p, 'Drive');
  await p.locator('.jmenu-item', { hasText: MVP_DRIVE }).click();
  await p.waitForTimeout(800);
}

/** "Choose what plays", from the journey screen; returns the switch. */
async function choosePlays(p) {
  await tripSheet(p, 'Drive');
  await p.locator('.jmenu-link', { hasText: 'Journey details' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Choose what plays/ }).click();
  await p.waitForTimeout(600);
  return p.locator('.plan-auto-hit');
}

// ── D2: a drive plays its echoes by itself ───────────────────────────────────────────
// Decision 1: "Play these as I reach them" is on when a drive starts, with no ask. A
// listener who turns it off keeps it off for the rest of that drive.
if (want('D2')) {
  const { ctx, p } = await freshApp(WILMINGTON);
  await startDrive(p);
  let sw = await choosePlays(p);
  check('D2: on a drive, "Play these as I reach them" is on from the start',
    (await sw.getAttribute('aria-pressed')) === 'true', `aria-pressed=${await sw.getAttribute('aria-pressed')}`);
  if ((await sw.getAttribute('aria-pressed')) === 'true') await sw.click();
  await p.waitForTimeout(300);
  await p.locator('.plan-close').click();
  await p.waitForTimeout(600);
  sw = await choosePlays(p);
  check('D2: turned off on the drive, it stays off', (await sw.getAttribute('aria-pressed')) === 'false',
    `aria-pressed=${await sw.getAttribute('aria-pressed')}`);
  await ctx.close();
}

/**
 * Drive the MVP route's traced road by GPS, from the Cotton Exchange, at `kph` for `seconds`,
 * one fix a second, calling `each` after every fix.
 */
const MVP_PATH = JSON.parse(readFileSync('content/routes/wilmington-to-southport.path.json', 'utf8')).path;
function pointAlong(path, km) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dist = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2));
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1], path[i]);
    if (km <= d) {
      const f = d ? km / d : 0;
      return { latitude: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, longitude: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f };
    }
    km -= d;
  }
  const last = path[path.length - 1];
  return { latitude: last[0], longitude: last[1] };
}
async function driveAlong(ctx, p, { kph, seconds }, each = async () => {}) {
  for (let t = 1; t <= seconds; t++) {
    await ctx.setGeolocation({ ...pointAlong(MVP_PATH, (kph * t) / 3600), accuracy: 10 });
    await p.waitForTimeout(1000);
    await each(t);
  }
}

// ── D3: on a drive, no "Synced · tap to play" for an echo that plays by itself ────────
// Decision 2. The drive at 47 km/h through downtown Wilmington, as the plan drove it.
if (want('D3')) {
  const { ctx, p } = await freshApp(WILMINGTON);
  await startDrive(p);
  for (let i = 0; i < 6 && (await p.locator('.toast-synced').count()); i++) {
    await p.locator('.toast-synced .toast-close').click().catch(() => {});
    await p.waitForTimeout(300);
  }
  const asked = new Set();
  let played = 0;
  await driveAlong(ctx, p, { kph: 47, seconds: 40 }, async () => {
    for (const t of await p.locator('.toast-synced').allInnerTexts()) if (/tap to play/.test(t)) asked.add(t.split('\n')[1] ?? t);
    if ((await p.locator('.echobar-orb[aria-label="Pause"]').count()) > 0) played++;
  });
  check('D3: on a drive, echoes play by themselves', played > 0, `${played} s playing`);
  check('D3: on a drive, no "Synced · tap to play" for an echo that plays by itself', asked.size === 0, [...asked].join(' / '));
  await ctx.close();
}

/** Time left on the journey, in minutes, from the chip's accessible name ("..., 2h 58m left"). */
async function minutesLeft(p) {
  const name = (await p.getByLabel(/Change your journey/).getAttribute('aria-label')) ?? '';
  const m = /(?:(\d+)h)?\s*(?:(\d+)\s*m(?:in)?)? left/.exec(name);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : NaN;
}

/** Pick the written flight, New York to Miami, from the trip sheet. */
async function startFlight(p) {
  await tripSheet(p, 'Fly');
  await p.locator('.jmenu-item', { hasText: 'Miami' }).first().click();
  await p.waitForTimeout(1000);
}

// ── F1: a flight moves in real time from takeoff ─────────────────────────────────────
// It ran any route in about 210 seconds (`?simulate` keeps that demo). Now the plane waits
// at the gate until the phone's speed says it has taken off.
if (want('F1')) {
  const { ctx, p } = await freshApp();
  await startFlight(p);
  const atStart = await minutesLeft(p);
  await p.waitForTimeout(20000);
  const later = await minutesLeft(p);
  check('F1: at the gate, a flight does not move by itself', atStart >= 170 && later === atStart, `${atStart} then ${later} min left`);
  await ctx.close();
}
if (want('F1')) {
  const { ctx, p } = await freshApp(BATTERY, '/?simulate');
  await startFlight(p);
  const atStart = await minutesLeft(p);
  await p.waitForTimeout(20000);
  const later = await minutesLeft(p);
  check('F1: ?simulate keeps the demo flight', later < atStart, `${atStart} then ${later} min left`);
  await ctx.close();
}

// ── F2: the phone's GPS corrects the flight when it can be believed ─────────────────
// A window seat gets a fix over Kitty Hawk, then another a second later at airliner
// speed: the flight has taken off, and is where the phone says, about a third of the way.
if (want('F2')) {
  const { ctx, p } = await freshApp();
  await startFlight(p);
  const atGate = await minutesLeft(p);
  await ctx.setGeolocation({ latitude: 36.07, longitude: -75.70, accuracy: 20 });
  await p.waitForTimeout(1000);
  await ctx.setGeolocation({ latitude: 36.0678, longitude: -75.6995, accuracy: 20 });
  await p.waitForTimeout(3000);
  const overKittyHawk = await minutesLeft(p);
  check('F2: a believable fix moves the flight to where the phone is', overKittyHawk < atGate - 30,
    `${atGate} min left at the gate, ${overKittyHawk} after the fix`);
  await ctx.close();
}

// ── F3: a flight plays each echo at its moment ───────────────────────────────────────
// Decision 8: flights play by themselves. Nothing ever "arrives" on a flight, so with every
// echo chosen and the switch on, nothing played. Fixes just past Atlantic City, where the
// first echo's moment is, take the flight there: it plays.
if (want('F3')) {
  const { ctx, p } = await freshApp();
  await startFlight(p);
  await ctx.setGeolocation({ latitude: 39.189, longitude: -74.4865, accuracy: 20 });
  await p.waitForTimeout(1000);
  await ctx.setGeolocation({ latitude: 39.1868, longitude: -74.4874, accuracy: 20 });
  let playing = '';
  for (let i = 0; i < 8 && !playing; i++) {
    await p.waitForTimeout(1000);
    if (await p.locator('.echobar-orb[aria-label="Pause"]').count()) playing = await p.locator('.echobar').innerText();
  }
  check('F3: past an echo\'s moment, the flight plays it by itself', /sand out of the lobbies/i.test(playing),
    playing.replace(/\s+/g, ' ') || 'nothing playing');
  await ctx.close();
}

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? errors.join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('journeys: drives and flights behave as approved');
process.exit(0);
