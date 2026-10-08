#!/usr/bin/env node
/**
 * Alignment, measured: where every key element sits, on every screen, at the sizes a phone
 * actually shows.
 *
 *   npm run audit:align            the report, and a failure if anything is off
 *   npm run audit:align -- --shots screenshots too, into ./align-shots/
 *
 * Written after "it has to be exact": the screenshots that went to James were all taken at
 * 390x844, which is an iPhone with no browser around it. In Safari the address bar and
 * toolbar leave about 390x664, and the sync card's orb was cut off at the top of a real
 * phone while every screenshot looked fine. So this measures at the sizes that matter:
 *
 *   iphone-safari  390x664   an iPhone 15 in Safari, bars showing
 *   iphone-full    390x844   the same phone, bars scrolled away or installed to home screen
 *   se-safari      375x553   an iPhone SE in Safari, the smallest screen we support
 *
 * and checks three things, each a number rather than an impression:
 *
 *   GUTTER    every edge-anchored element sits exactly --gutter (16px) from its side
 *   CENTRE    every element meant to be centred is within 1px of the centre line
 *   CLIPPED   nothing a person needs is cut off by the top or bottom of the screen
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4177;
const SHOTS = process.argv.includes('--shots');
const GUTTER = 16;
const TOLERANCE = 1;
const CASTLE = { latitude: 40.70331, longitude: -74.01705 };
// 250m north of the fort: far enough that nothing has synced before the walk starts.
const START = { latitude: 40.70556, longitude: -74.01705 };

const SIZES = [
  { name: 'iphone-safari', width: 390, height: 664 },
  { name: 'iphone-full', width: 390, height: 844 },
  { name: 'se-safari', width: 375, height: 553 },
];

/*
 * What each screen promises. `left`/`right`: that edge sits on the gutter. `centre`: the
 * element's middle is the screen's middle. `whole`: it must be entirely on screen (a
 * scrolling container counts as on screen if it can be scrolled to).
 */
const SCREENS = {
  map: [
    { sel: '.jchip', left: true },
    { sel: '.rail', right: true },
    { sel: '.echobar-row', left: true, right: true },
    { sel: '.map-credit', left: true },
    // The off-screen marker, when there is one: a whole pill, its right edge on the gutter.
    { sel: '.map-edge-plate', right: true, optional: true },
    // ...and sits the rail's own 10px above it when near it; from 24px up it is clear of it.
    { sel: '.map-edge-plate', gapAbove: '.rail', gap: 10, clear: 24, optional: true },
    { sel: '.nav', whole: true },
  ],
  synced: [
    { sel: '.synced-orb', centre: true, whole: true },
    { sel: '.synced-kicker', centre: true, whole: true },
    { sel: '.synced-say h2', centre: true, whole: true },
    { sel: '.synced-where', centre: true, whole: true },
    { sel: '.synced-rare', centre: true, whole: true },
    { sel: '.synced-later', centre: true, whole: true },
    // The stack as a whole: as much room above the orb as below the button.
    { sel: '.synced', stack: ['.synced-orb', '.synced-later'] },
  ],
  player: [
    { sel: '.hear-back', left: true, whole: true },
    { sel: '.hear-stop', right: true, whole: true },
    { sel: '.hear-kicker', left: true },
    { sel: '.hear-say h1', left: true },
    { sel: '.hear-clock', left: true, right: true, inner: true },
    { sel: '.hear-transport', left: true, right: true, inner: true, whole: true },
    { sel: '.hear-go', centre: true },
    { sel: '.hear-acts', left: true, right: true, inner: true, whole: true },
  ],
  popup: [
    { sel: '.pop', left: true, right: true, fits: true, whole: true },
    // The ✕ belongs to the kicker line and sits on its centre line.
    { sel: '.pop-close svg', middleOf: '.pop-kicker' },
  ],
  paywall: [
    // Fitted to an iPhone in Safari without scrolling; an SE scrolls, by design.
    { sel: '.paywall', fits: 'iphone' },
    { sel: '.paywall-count', centre: true },
    { sel: '.paywall h2', centre: true },
    { sel: '.paywall-plans', centre: true },
    { sel: '.paywall-buy', centre: true },
    { sel: '.paywall-later', centre: true },
  ],
};

spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}
if (SHOTS) mkdirSync('align-shots', { recursive: true });

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});

/** Measure one screen against its promises. */
async function measure(p, size, screen) {
  const rows = await p.evaluate(([checks, width, height, size]) => checks.map((c) => {
    const el = [...document.querySelectorAll(c.sel)].find((e) => e.getClientRects().length);
    if (!el) return c.optional ? { ...c, absent: true } : { ...c, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (c.gapAbove) {
      const below = document.querySelector(c.gapAbove)?.getBoundingClientRect();
      if (!below) return { ...c, absent: true };
      // Only judged when the marker is above the rail and near it; elsewhere on the edge it
      // is simply pointing at its echo.
      const gap = below.top - r.bottom;
      if (gap < 0 || gap > 30 || r.right < below.left) return { ...c, absent: true };
      const svg = el.ownerSVGElement?.getBoundingClientRect();
      return { ...c, gapNow: gap, info: `rail ${below.top.toFixed(1)}-${below.bottom.toFixed(1)} (h ${below.height.toFixed(1)}), map svg ${svg?.top.toFixed(1)}-${svg?.bottom.toFixed(1)}, nav top ${document.querySelector('.nav')?.getBoundingClientRect().top.toFixed(1)}` };
    }
    if (c.middleOf) {
      const other = document.querySelector(c.middleOf)?.getBoundingClientRect();
      if (!other) return { ...c, missing: true };
      const btn = el.closest('button')?.getBoundingClientRect();
      const card = el.closest('.pop')?.getBoundingClientRect();
      const dbg = `svg ${r.top.toFixed(1)}+${r.height}, kicker ${other.top.toFixed(1)}+${other.height.toFixed(1)}, button ${btn?.top.toFixed(1)}, card ${card?.top.toFixed(1)}`;
      return { ...c, dbg, dy: (r.top + r.height / 2) - (other.top + other.height / 2) };
    }
    if (c.stack) {
      const first = document.querySelector(c.stack[0])?.getBoundingClientRect();
      const last = document.querySelector(c.stack[1])?.getBoundingClientRect();
      if (!first || !last) return { ...c, missing: true };
      return { ...c, above: first.top - (r.top + parseFloat(cs.paddingTop)), below: r.bottom - parseFloat(cs.paddingBottom) - last.bottom };
    }
    // A full-width row lines up by where its content starts, not by its own box.
    if (c.fits && (c.fits === true || size.startsWith(c.fits)) && el.scrollHeight > el.clientHeight + 1) {
      return { ...c, x: r.left, rx: width - r.right, top: r.top, under: height - r.bottom, off: 0, hidden: el.scrollHeight - el.clientHeight };
    }
    const padL = c.inner ? parseFloat(cs.paddingLeft) : 0;
    const padR = c.inner ? parseFloat(cs.paddingRight) : 0;
    return { ...c, x: r.left + padL, rx: width - r.right + padR, top: r.top, under: height - r.bottom,
      off: r.left + r.width / 2 - width / 2 };
  }), [SCREENS[screen], size.width, size.height, size.name]);
  const problems = [];
  for (const r of rows) {
    if (r.absent) continue;
    if (r.missing) { problems.push(`${r.sel}: not on screen`); continue; }
    if (r.gapAbove && Math.abs(r.gapNow - r.gap) > TOLERANCE && !(r.clear && r.gapNow >= r.clear - TOLERANCE)) problems.push(`${r.sel}: ${r.gapNow.toFixed(1)}px above ${r.gapAbove}, should be ${r.gap}${process.env.DEBUG ? ` (${r.info})` : ''}`);
    if (r.middleOf && Math.abs(r.dy) > TOLERANCE) problems.push(`${r.sel}: ${r.dy.toFixed(1)}px off the centre line of ${r.middleOf}${process.env.DEBUG ? ` (${r.dbg})` : ''}`);
    if (r.hidden) problems.push(`${r.sel}: ${r.hidden}px of its content cut off inside it`);
    if (r.stack && Math.abs(r.above - r.below) > TOLERANCE * 2) problems.push(`${r.sel}: ${r.above.toFixed(0)}px above the content, ${r.below.toFixed(0)}px below`);
    if (r.left && Math.abs(r.x - GUTTER) > TOLERANCE) problems.push(`${r.sel}: left edge ${r.x.toFixed(1)}px, gutter is ${GUTTER}`);
    if (r.right && Math.abs(r.rx - GUTTER) > TOLERANCE) problems.push(`${r.sel}: right edge ${r.rx.toFixed(1)}px, gutter is ${GUTTER}`);
    if (r.centre && Math.abs(r.off) > TOLERANCE) problems.push(`${r.sel}: ${r.off.toFixed(1)}px off centre`);
    if (r.whole && (r.top < -TOLERANCE || r.under < -TOLERANCE)) {
      problems.push(`${r.sel}: cut off (${r.top < 0 ? `${(-r.top).toFixed(0)}px above the top` : `${(-r.under).toFixed(0)}px below the bottom`})`);
    }
  }
  if (SHOTS) await p.screenshot({ path: `align-shots/${screen}-${size.name}.png` });
  return problems;
}

async function onboard(p) {
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
  // Captures made before the welcome screens close are history, not a moment, and get no
  // card (App.tsx), so the walk only starts once the map is properly up.
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.getByLabel(/^Show me the map|the street map/).click().catch(() => {});
  await p.waitForTimeout(1500);
}

/** Walk in at a walking pace (a jump is rejected as implausible), then stand still. */
async function holdStill(p, ctx, until) {
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    await ctx.setGeolocation({ latitude: START.latitude + (CASTLE.latitude - START.latitude) * t, longitude: CASTLE.longitude });
    await p.waitForTimeout(500);
  }
  for (let i = 0; i < 70 && !(await until()); i++) {
    await ctx.setGeolocation({ ...CASTLE, latitude: CASTLE.latitude + (i % 2) * 0.00001 });
    await p.waitForTimeout(700);
  }
}

/*
 * Each screen from a fresh start, retried until it is actually on screen. The walk to the
 * fort runs on real timers and a simulated GPS, so a chain of screens off one walk failed
 * on whichever step the timing missed; a screen that never appeared is retried, and only
 * a screen that appears and measures wrong is a failure.
 */
const SETUP = {
  map: { heard: 0, ready: '.mapbar', steps: async () => {} },
  synced: { heard: 0, ready: '.synced', steps: async (p, ctx) => {
    await holdStill(p, ctx, async () => (await p.locator('.synced').count()) > 0);
    await p.waitForTimeout(1200); // the card animates in
  } },
  player: { heard: 0, ready: '.hear', steps: async (p, ctx) => {
    await holdStill(p, ctx, async () => (await p.locator('.synced').count()) > 0);
    await p.locator('.synced-press').click({ force: true });
    await p.waitForTimeout(1500);
  } },
  popup: { heard: 0, ready: '.pop', steps: async (p, ctx) => {
    await holdStill(p, ctx, async () => (await p.locator('.synced').count()) > 0);
    await p.locator('.synced-later').click();
    await p.waitForTimeout(500);
    await p.getByRole('button', { name: /^Open: Eight million/ }).click();
    await p.waitForTimeout(800);
  } },
  paywall: { heard: 10, ready: '.paywall', steps: async (p, ctx) => {
    await holdStill(p, ctx, async () => (await p.locator('.synced').count()) > 0);
    await p.locator('.synced-press').click({ force: true });
    await p.waitForTimeout(800);
  } },
};

async function attempt(size, screen) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation: START,
  });
  try {
    await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
    await ctx.addInitScript((n) => {
      localStorage.setItem('echo-finders:heard', JSON.stringify(Array.from({ length: n }, (_, i) => `elsewhere-${i}`)));
    }, SETUP[screen].heard);
    const p = await ctx.newPage();
    p.setDefaultTimeout(6000);
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    await onboard(p);
    await SETUP[screen].steps(p, ctx);
    if (!(await p.locator(SETUP[screen].ready).count())) {
      if (SHOTS) await p.screenshot({ path: `align-shots/MISSED-${screen}-${size.name}.png` });
      return null;
    }
    return await measure(p, size, screen);
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

// `ONLY=se-safari:popup` measures one pairing, `ONLY=se-safari` one size's screens.
const ONLY = process.env.ONLY?.split(':');
const report = [];
for (const size of SIZES.filter((s) => !ONLY || s.name === ONLY[0])) {
  for (const screen of Object.keys(SCREENS).filter((s) => !ONLY?.[1] || s === ONLY[1])) {
    let problems = null;
    for (let tries = 0; tries < 6 && problems === null; tries++) problems = await attempt(size, screen);
    report.push([size.name, screen, problems ?? [`never reached ${SETUP[screen].ready} in 6 tries`]]);
    console.log(`  ${size.name}: ${screen} done`);
  }
}
await browser.close();

let failures = 0;
for (const [size, screen, problems] of report) {
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${size.padEnd(14)} ${screen}`);
  for (const line of problems) console.log(`        ${line}`);
  failures += problems.length;
}
// Nothing measured is not a pass: `ONLY=se-safari` once matched no screens and said
// "all exact" about nothing.
if (!report.length) {
  console.log(`\nalign: nothing measured${ONLY ? ` (ONLY=${process.env.ONLY} matched no size and screen)` : ''}`);
  process.exit(1);
}
console.log(failures ? `\n${failures} misaligned` : '\nalign: all exact');
process.exit(failures ? 1 : 0);
