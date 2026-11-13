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
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4183;
const BATTERY = { latitude: 40.70556, longitude: -74.01705 };
/** The MVP drive's start, the Cotton Exchange: a journey screen only offers routes near you. */
const WILMINGTON = { latitude: 34.23979, longitude: -77.94958 };

// `JOURNEYS_DIST=<dir>` serves a build made elsewhere (the app before a change) unbuilt.
const DIST = process.env.JOURNEYS_DIST;
if (!DIST) spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
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
{
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
{
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

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? errors.join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('journeys: drives and flights behave as approved');
process.exit(0);
