#!/usr/bin/env node
/**
 * The paywall, end to end, in the built app.
 *
 * Written after it turned out the paywall could never appear: nothing counted an echo as
 * heard, so the free ten never ran out, and an echo playing itself on arrival skipped the
 * check entirely. Every other audit opens the app fresh, with nothing heard, so none of
 * them could notice. This one stands a listener at Castle Clinton with an allowance
 * already spent (seeded into the device's heard list) and walks each way through:
 *
 *   1. one free echo left: it plays, and it is counted
 *   2. none left: Play opens the paywall, City Pass chosen first
 *   3. buying the City Pass plays the echo, and survives a reload
 *   4. All-Access records a year
 *   5. an echo already heard replays free, past the limit
 *   6. hands-free on, none left: arriving opens the paywall instead of playing
 *
 * Nothing is charged: purchases are device-local until Stripe (docs/03-selling.md).
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4176;
const HERE = { latitude: 40.70331, longitude: -74.01705 };
const ECHO = 'castle-clinton-eight-million';

spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
const shutdown = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
process.on('exit', shutdown);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}

/* The cloud sandbox ships its own Chromium; CI and laptops use Playwright's. */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});

const failures = [];
const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures.push(name);
};

/** A fresh device that has already heard these, standing at Castle Clinton. */
async function standAtCastleClinton(heard, { handsFree = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
    permissions: ['geolocation'], geolocation: HERE,
  });
  // Seeded once per context, so a reload keeps whatever the app wrote since.
  await ctx.addInitScript((ids) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('echo-finders:heard', JSON.stringify(ids));
    sessionStorage.setItem('seeded', '1');
  }, heard);
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
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
  await p.waitForTimeout(3000);
  await p.getByLabel(/^Show me the map|the street map/).click().catch(() => {});
  await p.waitForTimeout(600);
  if (handsFree) {
    // Hands-free lives on the journey plan: chip, Journey details, then the plan.
    await p.getByLabel(/Change your journey/).click();
    await p.getByRole('button', { name: /Journey details/ }).click();
    // The Battery Park walk starts at Castle Clinton; its plan holds the switch.
    await p.getByRole('button', { name: /^Battery Park/ }).click();
    await p.locator('.pf-alt').first().click();
    // By keyboard: the switch sits under the plan's sticky footer at this height.
    await p.getByRole('button', { name: /Play these as I reach them/ }).focus();
    await p.keyboard.press('Enter');
    check('hands-free switched on',
      (await p.getByRole('button', { name: /Play these as I reach them/ }).getAttribute('aria-pressed')) === 'true');
    // Arriving is what matters from here, so nothing else is pressed.
    return { ctx, p };
  }
  await p.getByRole('button', { name: /^Open: / }).click().catch(() => {});
  return { ctx, p };
}

/** Hold still until it syncs: the watch needs fresh fixes, not one. */
async function holdStill(p, ctx, until, tries = 20) {
  for (let i = 0; i < tries && !(await until()); i++) {
    await ctx.setGeolocation({ ...HERE, latitude: HERE.latitude + (i % 2) * 0.00001 });
    await p.waitForTimeout(800);
  }
}

/**
 * Press play the way a listener would. Arriving puts up the Synced card, whose creature
 * is the play button; once that has been dismissed, it is the popup's Play.
 */
async function playHere(p, ctx) {
  const ready = async () => (await p.locator('.synced-press, .pop-go').count()) > 0;
  await holdStill(p, ctx, ready);
  const synced = p.locator('.synced-press');
  await ((await synced.count()) ? synced.first() : p.locator('.pop-go').first()).click();
  await p.waitForTimeout(700);
}

const store = (p, key) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const spent = (n) => Array.from({ length: n }, (_, i) => `elsewhere-${i}`);

// 1. One free echo left.
{
  const { ctx, p } = await standAtCastleClinton(spent(9));
  await playHere(p, ctx);
  const heard = await store(p, 'echo-finders:heard');
  check('the tenth free echo plays', (await p.locator('.paywall').count()) === 0);
  check('and is counted', heard?.length === 10 && heard.includes(ECHO), JSON.stringify(heard?.length));
  await ctx.close();
}

// 2–3. None left: the paywall, then the City Pass.
{
  const { ctx, p } = await standAtCastleClinton(spent(10));
  await playHere(p, ctx);
  check('the eleventh opens the paywall', (await p.locator('.paywall').count()) === 1);
  check('naming the city, City Pass chosen',
    await p.getByRole('radio', { name: /New York City Pass/ }).isChecked().catch(() => false));
  check('All-Access offered beside it', (await p.getByRole('radio', { name: /All-Access/ }).count()) === 1);
  await p.getByRole('button', { name: /Get the City Pass/ }).click();
  await p.waitForTimeout(800);
  check('buying closes the paywall', (await p.locator('.paywall').count()) === 0);
  const bought = await store(p, 'echo-finders:entitlement');
  check('and records the New York pass', bought?.kind === 'passes' && bought.cities?.includes('new-york'),
    JSON.stringify(bought));
  check('and plays the echo they reached for', (await store(p, 'echo-finders:heard'))?.includes(ECHO));

  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.getByLabel(/^Show me the map|the street map/).click().catch(() => {});
  await p.getByRole('button', { name: /^Open: / }).click().catch(() => {});
  await holdStill(p, ctx, async () => (await p.locator('.synced-press, .pop-go').count()) > 0);
  const kept = await store(p, 'echo-finders:entitlement');
  check('the pass survives a reload', kept?.cities?.includes('new-york'), JSON.stringify(kept));
  await ctx.close();
}

// 4. All-Access.
{
  const { ctx, p } = await standAtCastleClinton(spent(10));
  await playHere(p, ctx);
  await p.getByRole('radio', { name: /All-Access/ }).check();
  await p.getByRole('button', { name: /Start All-Access/ }).click();
  await p.waitForTimeout(800);
  const year = await store(p, 'echo-finders:entitlement');
  const days = year?.allAccessUntil ? (year.allAccessUntil - Date.now()) / 86_400_000 : 0;
  check('All-Access records a year', days > 364 && days <= 365, `${days.toFixed(1)} days`);
  check('and closes the paywall', (await p.locator('.paywall').count()) === 0);
  await ctx.close();
}

// 5. Already heard: always free.
{
  const { ctx, p } = await standAtCastleClinton([...spent(9), ECHO]);
  await playHere(p, ctx);
  check('an echo already heard replays free past the limit', (await p.locator('.paywall').count()) === 0);
  await ctx.close();
}

// 6. Hands-free arrival.
{
  const { ctx, p } = await standAtCastleClinton(spent(10), { handsFree: true });
  await holdStill(p, ctx, async () => (await p.locator('.paywall').count()) > 0, 75);
  check('hands-free arrival asks rather than playing for free', (await p.locator('.paywall').count()) === 1);
  check('and does not count it', !(await store(p, 'echo-finders:heard'))?.includes(ECHO));
  await ctx.close();
}

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? errors.join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('paywall: all good');
process.exit(0);
