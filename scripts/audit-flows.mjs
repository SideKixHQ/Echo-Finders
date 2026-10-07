#!/usr/bin/env node
/**
 * Every way in has a way out: the app's main journeys, tapped through in the built app.
 *
 *   npm run audit:flows
 *
 * Written after James got stuck: My Echoes had a sliders icon (which reads as FILTER)
 * that opened Settings, and Settings had no title, no back button and no tab lit. Every
 * other audit measured how screens look; none of them pressed a button and checked where
 * it went or whether there was a way back. This one does, for each journey:
 *
 *   - the screen you land on says what it is (a visible title, or its own landmark)
 *   - the tab bar shows where you are
 *   - the way back is visible and takes you back
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4178;
const CASTLE = { latitude: 40.70331, longitude: -74.01705 };
const START = { latitude: 40.70556, longitude: -74.01705 };

spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
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

async function freshApp() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation: START,
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  for (let i = 0; i < 9 && await p.locator('.onb').count(); i++) {
    const start = p.getByRole('button', { name: /Start looking/ });
    const allow = p.getByRole('button', { name: /Allow location/ });
    if (await start.count()) await start.click();
    else if (await allow.count()) { await allow.click(); await p.waitForTimeout(1500); }
    else {
      const all = p.locator('.onb-all');
      if (await all.count() && await all.isEnabled()) await all.click();
      await p.locator('.onb-go').first().click();
    }
    await p.waitForTimeout(400);
  }
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(2000);
  await p.getByLabel(/^Show me the map|the street map/).click().catch(() => {});
  await p.waitForTimeout(600);
  return { ctx, p };
}

const visible = async (loc) => (await loc.count()) > 0 && await loc.first().isVisible();
const title = (p, text) => p.locator('h1:visible', { hasText: text });
const currentTab = (p) => p.locator('.nav [aria-current="page"]').textContent().catch(() => '');

// ── My Echoes, and Settings from it ─────────────────────────────────────────────
{
  const { ctx, p } = await freshApp();
  await p.getByRole('button', { name: /My Echoes/ }).click();
  await p.waitForTimeout(500);
  check('My Echoes: titled', await visible(title(p, 'My Echoes')));
  check('My Echoes: its tab is lit', /My Echoes/i.test(await currentTab(p)));

  const settings = p.getByRole('button', { name: 'Settings' });
  check('My Echoes: the settings button says Settings', await visible(settings));
  await settings.click();
  await p.waitForTimeout(500);
  check('Settings: titled', await visible(title(p, 'Settings')));
  check('Settings: My Echoes tab stays lit', /My Echoes/i.test(await currentTab(p)));
  const back = p.getByRole('button', { name: 'Back to My Echoes' });
  check('Settings: a visible way back', await visible(back));
  await back.click().catch(() => {});
  await p.waitForTimeout(500);
  check('Settings: back returns to My Echoes', await visible(title(p, 'My Echoes')));

  // Out by the tab bar instead.
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.waitForTimeout(400);
  await p.locator('.nav').getByRole('button', { name: /My Echoes/ }).click();
  await p.waitForTimeout(400);
  check('Settings: the My Echoes tab also leads back', await visible(title(p, 'My Echoes')));
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.waitForTimeout(400);
  await p.locator('.nav').getByRole('button', { name: /Map/ }).click();
  await p.waitForTimeout(600);
  check('Settings: the Map tab leads to the map', await visible(p.locator('.mapbar')));
  check('Map: its tab is lit', /Map/i.test(await currentTab(p)));
  await ctx.close();
}

// ── The trip sheet ──────────────────────────────────────────────────────────────
{
  const { ctx, p } = await freshApp();
  const chip = p.getByLabel(/Change your journey/);
  await chip.click();
  await p.waitForTimeout(400);
  check('Trip sheet: opens from the journey chip', await visible(p.getByRole('dialog')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  check('Trip sheet: Escape closes it', !(await visible(p.locator('.jmenu'))));
  await chip.click();
  await p.waitForTimeout(300);
  await chip.click();
  await p.waitForTimeout(400);
  check('Trip sheet: the chip closes it again', !(await visible(p.locator('.jmenu'))));
  await ctx.close();
}

// ── A story: its card, then the player ──────────────────────────────────────────
// The walk runs on real timers and a simulated GPS, so arriving is retried from a fresh
// start; only a journey that arrives and then has no way back is a failure.
async function arrive() {
  for (let tries = 0; tries < 5; tries++) {
    const { ctx, p } = await freshApp();
    // Walk in at a walking pace; a jump is rejected as implausible.
    for (let i = 0; i <= 10; i++) {
      await ctx.setGeolocation({ latitude: START.latitude + (CASTLE.latitude - START.latitude) * (i / 10), longitude: CASTLE.longitude });
      await p.waitForTimeout(500);
    }
    for (let i = 0; i < 70 && !(await p.locator('.synced').count()); i++) {
      await ctx.setGeolocation({ ...CASTLE, latitude: CASTLE.latitude + (i % 2) * 0.00001 });
      await p.waitForTimeout(700);
    }
    if (await p.locator('.synced').count()) return { ctx, p };
    await ctx.close();
  }
  return null;
}
{
  const arrived = await arrive();
  check('Arriving: the sync card appears', arrived !== null);
  if (arrived) {
    const { ctx, p } = arrived;
    await p.locator('.synced-later').click().catch(() => {});
    await p.waitForTimeout(500);
    check('Sync card: "Keep it for later" closes it', !(await visible(p.locator('.synced'))));

    await p.getByRole('button', { name: /^Open: Eight million/ }).click().catch(() => {});
    await p.waitForTimeout(600);
    check('Story card: opens from the bar', await visible(p.locator('.pop')));
    await p.locator('.pop-close').click().catch(() => {});
    await p.waitForTimeout(400);
    check('Story card: ✕ closes it', !(await visible(p.locator('.pop'))));

    await p.getByRole('button', { name: /^Open: Eight million/ }).click().catch(() => {});
    await p.waitForTimeout(500);
    await p.locator('.pop-go').click().catch(() => {});
    await p.waitForTimeout(1200);
    check('Player: Play opens it', await visible(p.locator('.hear')));
    const back = p.getByRole('button', { name: 'Back to the map' });
    check('Player: a visible way back', await visible(back));
    await back.click().catch(() => {});
    await p.waitForTimeout(600);
    check('Player: back returns to the map', !(await visible(p.locator('.hear'))) && await visible(p.locator('.mapbar')));
    await ctx.close();
  }
}

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? errors.join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('flows: every way in has a way out');
process.exit(0);
