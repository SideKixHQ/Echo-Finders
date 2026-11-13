#!/usr/bin/env node
/**
 * Does every screen fit an iPhone, inside the app.
 *
 *   npm run audit:fit
 *   FIT_URL=http://127.0.0.1:5173 node scripts/audit-fit.mjs    against a running server
 *   FIT_SHOTS=dir node scripts/audit-fit.mjs                     a screenshot of each, 2x
 *   FIT_ONLY=iphone-16 / FIT_ONLY=iphone-16:player               one size, or one screen
 *   FIT_INSETS=0                                                 as a browser: no insets
 *   FIT_THEME=light                                              the light scheme
 *
 * Written after TestFlight build 10 (James, 2026-11-13): the iPhone's clock and battery sat
 * on top of the search box. The app shows the web app in a WebView drawn edge to edge
 * (`apps/ios/src/shell/WebShell.tsx`), so the page runs under the status bar and the home
 * indicator and has to keep clear of them itself, with env(safe-area-inset-*). In Safari
 * the top inset is 0 (Safari keeps the page below the status bar), so every render this
 * project had ever measured was blind to it.
 *
 * Here the insets are the real ones, set through Chromium's own safe area override, so
 * env() reads exactly what an iPhone reports inside the app:
 *
 *   iphone-se      375x667  top 20, bottom 0
 *   iphone-16      393x852  top 59, bottom 34   (iPhone 15 and 16, Dynamic Island)
 *   iphone-16-max  440x956  top 62, bottom 34   (iPhone 16 Pro Max)
 *
 * and each screen fails on:
 *
 *   STATUS BAR       a line of text, a control, an icon or a picture drawn in the top inset
 *   HOME INDICATOR   the same in the bottom inset
 *   TOO LONG         the page is taller or wider than the screen, so it scrolls as a whole
 *   TOO SHORT        the app does not reach the bottom of the screen
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

/*
 * What puts a toast away: its ✕, or OK on the usage counts note ("We count visits, not
 * you"), which has no ✕ in its approved design. It arrives on the map a few seconds after
 * the first run and sat over the menus these journeys tap through (the planned walk's
 * "Plan a walk" went under it), so it is put away the way every other toast is.
 */
const TOAST_DISMISS = '.toast-close, .toast-usage .toast-act-go';

const PORT = 4191;
let BASE = process.env.FIT_URL;
if (!BASE) {
  BASE = `http://127.0.0.1:${PORT}`;
  spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
  process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} });
}
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/`)).ok) break; } catch {}
  await sleep(500);
}
const SHOTS = process.env.FIT_SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const NO_INSETS = process.env.FIT_INSETS === '0';
const THEME = process.env.FIT_THEME === 'light' ? 'light' : 'dark';

const SIZES = [
  { name: 'iphone-se', width: 375, height: 667, top: 20, bottom: 0 },
  { name: 'iphone-16', width: 393, height: 852, top: 59, bottom: 34 },
  { name: 'iphone-16-max', width: 440, height: 956, top: 62, bottom: 34 },
];

const WILMINGTON = { latitude: 34.2357, longitude: -77.9452 };
const CASTLE = { latitude: 40.70331, longitude: -74.01705 };
// 250m north of the fort: far enough that nothing has synced before the walk starts.
const START = { latitude: 40.70556, longitude: -74.01705 };

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launch = () => chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});
let browser = await launch();

/**
 * What is drawn where it should not be, measured in the page.
 *
 * Text (each line), controls, icons and pictures. Each is cut to what its clipping
 * ancestors let show, then hit tested where it meets an inset: only what is actually on top
 * there counts, so a map pin under the tab bar is not "under the home indicator".
 */
const PROBE = ([top, bottom]) => {
  const W = innerWidth, H = innerHeight;
  const out = [];
  // Hit testing with every element hittable, so a label with pointer-events: none still
  // answers for itself. Removed before returning.
  const style = document.createElement('style');
  style.textContent = '* { pointer-events: auto !important; }';
  document.head.append(style);
  const name = (el) => {
    const c = (el.className?.baseVal ?? el.className ?? '').toString().trim().split(/\s+/)[0];
    return c ? `.${c}` : el.tagName.toLowerCase();
  };
  const shown = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.08) return false;
    }
    return true;
  };
  /** The part of a box its clipping ancestors leave on screen. */
  const cut = (r, el) => {
    let { left, right, top: t, bottom: b } = r;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/visible/.test(cs.overflowY) && /visible/.test(cs.overflowX)) continue;
      const box = a.getBoundingClientRect();
      left = Math.max(left, box.left); right = Math.min(right, box.right);
      t = Math.max(t, box.top); b = Math.min(b, box.bottom);
    }
    left = Math.max(left, 0); right = Math.min(right, W); t = Math.max(t, 0); b = Math.min(b, H);
    return right - left > 1 && b - t > 1 ? { left, right, top: t, bottom: b } : null;
  };
  /** Is `el` what you see at some point of `box` inside the band [y0, y1). */
  const seenIn = (el, box, y0, y1) => {
    const t = Math.max(box.top, y0), b = Math.min(box.bottom, y1);
    if (b - t < 1) return false;
    for (const fx of [0.5, 0.2, 0.8]) {
      const x = box.left + (box.right - box.left) * fx;
      const hit = document.elementFromPoint(x, (t + b) / 2);
      if (hit && (hit === el || el.contains(hit) || (hit.contains(el) && hit !== document.body))) return true;
    }
    return false;
  };
  const items = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    const host = t.parentElement;
    if (!text || !host || host.closest('script, style, .sr-only, .maplibregl-ctrl-attrib-inner')) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) if (r.width > 1) items.push({ el: host, r, what: `"${text.slice(0, 32)}"` });
  }
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], img, svg')) {
    // The map's own drawing is the background, which runs edge to edge like a photo would.
    if (el.closest('.map, .map-canvas') && el.tagName !== 'BUTTON') continue;
    if (el.tagName === 'svg' && el.parentElement?.closest('svg')) continue;
    items.push({ el, r: el.getBoundingClientRect(), what: name(el) });
  }
  const seen = new Set();
  for (const { el, r, what } of items) {
    if (!shown(el)) continue;
    const box = cut(r, el);
    if (!box) continue;
    for (const [kind, y0, y1] of [['STATUS BAR', 0, top], ['HOME INDICATOR', H - bottom, H]]) {
      if (y1 - y0 < 1 || !seenIn(el, box, y0, y1)) continue;
      const key = `${kind}|${what}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${kind}: ${what} in ${name(el)} at ${box.top.toFixed(0)} to ${box.bottom.toFixed(0)}`);
    }
  }
  style.remove();
  // A panel over the map stops above the tab bar; what does not fit scrolls inside it.
  const nav = document.querySelector('.nav')?.getBoundingClientRect();
  for (const sel of ['.mapbar .kind-box', '.jmenu', '.pop']) {
    const el = document.querySelector(sel);
    if (!el || !nav || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > nav.top + 1) out.push(`UNDER THE TAB BAR: ${sel} runs ${(r.bottom - nav.top).toFixed(0)}px under it`);
  }
  const doc = document.scrollingElement;
  if (doc.scrollHeight > H + 1 || scrollY > 0) out.push(`TOO LONG: the page is ${doc.scrollHeight}px tall on a ${H}px screen (scrolled ${scrollY})`);
  if (doc.scrollWidth > W + 1) out.push(`TOO LONG: the page is ${doc.scrollWidth}px wide on a ${W}px screen`);
  const phone = document.querySelector('.phone')?.getBoundingClientRect();
  if (!phone) out.push('the app is not on the page');
  else {
    if (phone.top < -0.5 || phone.top > 0.5) out.push(`the app starts ${phone.top.toFixed(1)}px from the top of the screen`);
    if (phone.bottom < H - 0.5) out.push(`TOO SHORT: the app ends ${(H - phone.bottom).toFixed(1)}px above the bottom of the screen`);
    if (phone.bottom > H + 0.5) out.push(`TOO LONG: the app runs ${(phone.bottom - H).toFixed(1)}px past the bottom of the screen`);
  }
  return out;
};

const report = [];
const errors = [];
let size;
let ctxN = 0;

async function device(geo, { onboarded = true, heard = 0 } = {}) {
  if (!browser.isConnected()) browser = await launch();
  const ctx = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: size.width, height: size.height }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, ...(geo ? { permissions: ['geolocation'], geolocation: geo } : {}),
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript(([s, n]) => {
    if (sessionStorage.getItem('fit-seeded')) return;
    sessionStorage.setItem('fit-seeded', '1');
    if (s) {
      localStorage.setItem('echo-finders:onboarded', '1');
      localStorage.setItem('echo-finders:how-echoes-unlock', '1');
    }
    if (n) localStorage.setItem('echo-finders:heard', JSON.stringify(Array.from({ length: n }, (_, i) => `elsewhere-${i}`)));
  }, [onboarded, heard]);
  const p = await ctx.newPage();
  p.setDefaultTimeout(5000);
  p.on('pageerror', (e) => errors.push(e.message));
  // The phone's insets, as env(safe-area-inset-*) reads them inside the app.
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: NO_INSETS ? { top: 0, bottom: 0, left: 0, right: 0 } : { top: size.top, bottom: size.bottom, left: 0, right: 0 },
  });
  ctxN++;
  const look = async (screen, ready) => {
    if (ready && !(await p.locator(ready).count())) {
      report.push([size.name, screen, [`never reached (${ready} not on the page)`]]);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/MISSED-${size.name}-${screen.replace(/\W+/g, '-')}.png` });
      return;
    }
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(350);
    // A Chromium without the safe area override would measure nothing and pass: say so.
    const insets = await p.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
      document.body.append(d);
      const cs = getComputedStyle(d);
      const got = [parseFloat(cs.paddingTop), parseFloat(cs.paddingBottom)];
      d.remove();
      return got;
    });
    const want = NO_INSETS ? [0, 0] : [size.top, size.bottom];
    if (insets[0] !== want[0] || insets[1] !== want[1]) {
      report.push([size.name, screen, [`the page reads insets ${insets.join('/')}, not ${want.join('/')}: this Chromium did not take the override`]]);
      return;
    }
    const problems = NO_INSETS ? [] : await p.evaluate(PROBE, [size.top, size.bottom]);
    report.push([size.name, screen, problems]);
    if (SHOTS) {
      // The phone's own status bar, Dynamic Island and home indicator, drawn over the
      // picture only (after measuring), so a screenshot shows what sits under them.
      if (!NO_INSETS) await p.evaluate(([t, b, island]) => {
        const d = document.createElement('div');
        d.id = 'fit-phone';
        d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 15px system-ui;color:#fff';
        d.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:${t}px;background:rgba(255,40,90,.28);border-bottom:1px dashed #ff2a5a"></div>`
          + `<span style="position:absolute;left:${island ? 46 : 16}px;top:${Math.max(2, t / 2 - 9)}px;text-shadow:0 0 2px #000">9:41</span>`
          + (island ? `<div style="position:absolute;left:50%;top:11px;width:124px;height:36px;margin-left:-62px;border-radius:18px;background:#000"></div>` : '')
          + (b ? `<div style="position:absolute;left:0;right:0;bottom:0;height:${b}px;background:rgba(255,40,90,.28);border-top:1px dashed #ff2a5a"></div>`
            + `<div style="position:absolute;left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#fff;box-shadow:0 0 2px #000"></div>` : '');
        document.body.append(d);
      }, [size.top, size.bottom, size.top > 40]);
      await p.screenshot({ path: `${SHOTS}/${screen.replace(/\W+/g, '-')}-${size.name}.png` });
      await p.evaluate(() => document.getElementById('fit-phone')?.remove());
    }
  };
  return { ctx, p, look };
}
const tap = (l) => l.first().click({ timeout: 3000 }).catch(() => {});
const closeToasts = async (p) => {
  for (let i = 0; i < 3; i++) await p.locator(TOAST_DISMISS).first().click({ timeout: 400 }).catch(() => {});
};

/** Walk in to Castle Clinton at a walking pace, then stand still until it syncs. */
async function walkToCastle(p, ctx) {
  for (let i = 0; i <= 10; i++) {
    await ctx.setGeolocation({ latitude: START.latitude + (CASTLE.latitude - START.latitude) * (i / 10), longitude: CASTLE.longitude });
    await p.waitForTimeout(500);
  }
  for (let i = 0; i < 60 && !(await p.locator('.toast-synced').count()); i++) {
    await ctx.setGeolocation({ ...CASTLE, latitude: CASTLE.latitude + (i % 2) * 0.00001 });
    await p.waitForTimeout(700);
  }
}

const SCREENS = {
  /* First run, its search, and "How echoes unlock" after it. */
  async firstRun() {
    const { ctx, p, look } = await device(WILMINGTON, { onboarded: false });
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await look('first run', '.onb');
    await p.getByLabel('Search a city or ZIP code').fill('Wilm').catch(() => {});
    await p.waitForTimeout(500);
    await look('first run, searching', '.onb');
    await p.getByLabel('Search a city or ZIP code').fill('').catch(() => {});
    await tap(p.getByRole('button', { name: 'Find echoes near me' }));
    await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(700);
    await look('how echoes unlock', '.how');
    await ctx.close();
  },
  /* The map and everything over it, the tabs and their sheets. */
  async map() {
    const { ctx, p, look } = await device(WILMINGTON);
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3000);
    if (await p.locator('.toast').count()) await look('toast', '.toast');
    await closeToasts(p);
    await look('map', '.mapbar');
    await tap(p.locator('.mapbar .kind-tap'));
    await p.waitForTimeout(400);
    await look('topic panel', '.catpop, #kind-box');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await tap(p.locator('.echobar-tap'));
    await p.waitForTimeout(800);
    await look('echo card', '.pop');
    await tap(p.locator('.pop-acts button', { hasText: 'More' }));
    await p.waitForTimeout(300);
    await look('echo card, more', '.pop-menu');
    await tap(p.locator('.pop-menu [role="menuitem"]', { hasText: /Report/ }));
    await p.waitForTimeout(500);
    await look('report a problem', '.feedback');
    await tap(p.locator('.feedback button', { hasText: 'Cancel' }));
    await p.waitForTimeout(300);
    await tap(p.locator('.pop-close'));
    await p.waitForTimeout(300);
    const box = p.getByLabel('Search a city, place or ZIP code');
    await box.click().catch(() => {});
    await box.fill('boston').catch(() => {});
    await p.waitForTimeout(900);
    await look('search', '.msearch.open');
    await tap(p.getByRole('button', { name: 'Close search' }));
    await p.waitForTimeout(300);
    await closeToasts(p);
    await p.locator('.pop-close').click({ force: true, timeout: 800 }).catch(() => {});
    await tap(p.getByLabel(/Change your journey/));
    await p.waitForTimeout(500);
    await look('journey sheet', '.jmenu');
    await tap(p.getByText('Plan a walk'));
    await p.waitForTimeout(1200);
    await look('plan a walk', '.pw');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await tap(p.locator('.nav button').nth(1));
    await p.waitForTimeout(700);
    await look('my echoes', '.screen-body');
    await tap(p.locator('.coll-view', { hasText: 'Routes' }));
    await p.waitForTimeout(500);
    await look('routes', '.screen-body');
    await tap(p.locator('.nav button').nth(2));
    await p.waitForTimeout(700);
    await look('settings', '.screen-body');
    await p.locator('.screen-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
    await p.waitForTimeout(300);
    await look('settings, scrolled to the end', '.screen-body');
    await p.locator('.screen-body').evaluate((b) => { b.scrollTop = 0; });
    await tap(p.locator('.membership-row').first());
    await p.waitForTimeout(700);
    await look('settings, pass options', '.paywall');
    await ctx.close();
  },
  /* Nothing nearby. */
  async nowhere() {
    const at = { latitude: 35.5, longitude: -79.2 };
    const { ctx, p, look } = await device(at);
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3000);
    await closeToasts(p);
    await look('nothing nearby', '.nowhere');
    await ctx.close();
  },
  /* Walking to an echo: the turn card and the echo bar as the directions. */
  async directions() {
    const at = { latitude: 34.2357, longitude: -77.929 };
    const { ctx, p, look } = await device(at);
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3000);
    await closeToasts(p);
    const box = p.getByLabel('Search a city, place or ZIP code');
    await box.click().catch(() => {});
    await box.fill('An Ordinary Corner').catch(() => {});
    await p.waitForTimeout(900);
    await tap(p.locator('.msearch-go'));
    await p.waitForTimeout(1500);
    await p.locator('.pop-tip-ok').click({ timeout: 800 }).catch(() => {});
    await tap(p.locator('.pop-aim:not(.pop-keep)'));
    await p.waitForTimeout(3000);
    await closeToasts(p);
    await look('directions', '.echobar-dir');
    await ctx.close();
  },
  /* An echo syncs: its toast, the player, read along. */
  async player() {
    const { ctx, p, look } = await device(START);
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await walkToCastle(p, ctx);
    await p.waitForTimeout(800);
    await look('synced toast', '.toast-synced');
    await p.locator('.toast-synced .toast-play').click({ force: true }).catch(() => {});
    await p.waitForTimeout(1500);
    await look('player', '.hear');
    await tap(p.locator('.hear-acts button', { hasText: 'Read' }));
    await p.waitForTimeout(800);
    await look('player, read along', '.hear-read');
    await ctx.close();
  },
  /* Ten heard: the next one asks for a pass. */
  async paywall() {
    const { ctx, p, look } = await device(START, { heard: 10 });
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await walkToCastle(p, ctx);
    await p.locator('.toast-synced .toast-play').click({ force: true }).catch(() => {});
    await p.waitForTimeout(1000);
    await look('paywall', '.paywall');
    await ctx.close();
  },
};

const ONLY = process.env.FIT_ONLY?.split(':');
for (size of SIZES.filter((s) => !ONLY || s.name === ONLY[0])) {
  for (const [name, run] of Object.entries(SCREENS)) {
    if (ONLY?.[1] && name !== ONLY[1]) continue;
    try {
      await run();
    } catch (e) {
      report.push([size.name, name, [`stopped: ${String(e?.message ?? e).split('\n')[0]}`]]);
    }
    console.log(`  ${size.name}: ${name} done`);
  }
}
await browser.close();

let failures = 0;
for (const [s, screen, problems] of report) {
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${s.padEnd(14)} ${screen}`);
  for (const line of problems) console.log(`        ${line}`);
  failures += problems.length;
}
if (!report.length) {
  console.log('\nfit: nothing measured');
  process.exit(1);
}
if (errors.length) console.log(`\npage errors: ${[...new Set(errors)].join('\n  ')}`);
console.log(failures ? `\n${failures} problems fitting the iPhone` : `\nfit: every screen fits, ${report.length} measured`);
process.exit(failures ? 1 : 0);
