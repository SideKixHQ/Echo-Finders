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

// ── The three tabs ──────────────────────────────────────────────────────────────
{
  const { ctx, p } = await freshApp();
  const nav = p.locator('.nav');
  await nav.getByRole('button', { name: /My Echoes/ }).click();
  await p.waitForTimeout(500);
  check('My Echoes: titled', await visible(title(p, 'My Echoes')));
  // The demo walk ran behind onboarding and saved Castle Clinton, so a new listener's
  // collection opened with a fort they had never walked to.
  check('My Echoes: nothing found before a single step', (await p.locator('.entry').count()) === 0);
  check('My Echoes: its tab is lit', /My Echoes/i.test(await currentTab(p)));
  check('My Echoes: no settings button pretending to be a filter',
    (await p.locator('.screen-body').getByRole('button', { name: 'Settings' }).count()) === 0);

  await nav.getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(500);
  check('Settings: a tab of its own', await visible(title(p, 'Settings')));
  check('Settings: its tab is lit', /Settings/i.test(await currentTab(p)));
  await nav.getByRole('button', { name: /My Echoes/ }).click();
  await p.waitForTimeout(400);
  check('Settings: My Echoes tab leads out', await visible(title(p, 'My Echoes')));
  await nav.getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(400);
  await nav.getByRole('button', { name: /Map/ }).click();
  await p.waitForTimeout(600);
  check('Settings: Map tab leads to the map', await visible(p.locator('.mapbar')));
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

    // My Echoes now holds the fort (History), so its filter has something to filter.
    await p.locator('.nav').getByRole('button', { name: /My Echoes/ }).click();
    await p.waitForTimeout(500);
    const filter = p.getByRole('button', { name: /^Filter my echoes/ });
    const fort = p.locator('.entry', { hasText: 'Eight million' });
    check('Filter: a filter button on My Echoes', await visible(filter));
    await filter.click();
    await p.waitForTimeout(400);
    check('Filter: opens the category chips', await visible(p.locator('#coll-filter .chip')));
    await p.locator('#coll-filter').getByRole('button', { name: /Ghosts/ }).click();
    await p.waitForTimeout(400);
    check('Filter: a kind you have none of hides the rest and says so',
      !(await visible(fort)) && await visible(p.locator('.coll-nomatch')));
    check('Filter: the button shows a filter is on', /filtered/.test(await filter.getAttribute('aria-label') ?? ''));
    await p.getByRole('button', { name: 'Show all' }).click();
    await p.waitForTimeout(400);
    check('Filter: Show all brings everything back', await visible(fort));
    await p.locator('#coll-filter').getByRole('button', { name: /History/ }).click();
    await p.waitForTimeout(400);
    check("Filter: the fort's own kind shows it", await visible(fort));

    // Place and Travel: only what the collection holds, and each narrows to the fort.
    const placeGroup = p.getByRole('group', { name: 'Place' });
    const travelGroup = p.getByRole('group', { name: 'Travel' });
    check('Filter: Place offers New York', await visible(placeGroup.getByRole('button', { name: 'New York' })));
    await placeGroup.getByRole('button', { name: 'New York' }).click();
    await p.waitForTimeout(300);
    check('Filter: New York shows the fort', await visible(fort));
    check('Filter: Travel offers Walking', await visible(travelGroup.getByRole('button', { name: 'Walking' })));
    check('Filter: Travel offers no way you have not travelled',
      (await travelGroup.getByRole('button', { name: 'Flying' }).count()) === 0);
    await travelGroup.getByRole('button', { name: 'Walking' }).click();
    await p.waitForTimeout(300);
    check('Filter: Walking shows the fort', await visible(fort));

    // Another journey: what was found on the first stays in My Echoes.
    await p.locator('.nav').getByRole('button', { name: /Map/ }).click();
    await p.waitForTimeout(500);
    await p.getByLabel(/Change your journey/).click();
    await p.locator('.jmenu-item', { hasText: 'Ocean Drive' }).first().click();
    await p.waitForTimeout(1500);
    await p.locator('.nav').getByRole('button', { name: /My Echoes/ }).click();
    await p.waitForTimeout(800);
    check('My Echoes: keeps what was found on other journeys', await visible(fort));
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
