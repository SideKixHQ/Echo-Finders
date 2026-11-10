/**
 * Is any words or icon cut off at the edge of its box.
 *
 * Written after the live "Where are you?" screen shipped with a search box reading
 * "Search a city, place or ZIP coc" and the "Walking nearby" chip's chevron sliced in
 * half (James, 2026-11-10). Neither was caught, because the layout audit only asked
 * whether a LEAF text element overflowed its own `overflow: hidden` box: the chevron is
 * an icon inside a clipping button, and a placeholder is not an element at all.
 *
 * At 375x667, the smallest phone this app is used on, it walks the main screens and fails
 * on three things:
 *
 *   CLIPPED      a button, label or text element that hides its overflow (or will not
 *                wrap) and holds more than its box. An ellipsis is a decision and is
 *                allowed; a cut is not.
 *   CUT BY A PARENT   a run of text that reaches past the edge of an ancestor that clips
 *                it, which is how a word ends up half drawn at the edge of a card.
 *                Horizontal scrollers are exempt: their content is meant to run on.
 *   PLACEHOLDER  an empty input whose placeholder is wider than the room inside it.
 *
 *   node scripts/audit-clip.mjs
 *   CLIP_URL=http://127.0.0.1:5315 node scripts/audit-clip.mjs   (against a running server)
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4179;
let BASE = process.env.CLIP_URL;
let shutdown = () => {};
if (!BASE) {
  BASE = `http://127.0.0.1:${PORT}`;
  spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'inherit' });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
  shutdown = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
  process.on('exit', shutdown);
}
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/`)).ok) break; } catch {}
  await sleep(500);
}

/* The cloud sandbox ships its own Chromium; CI and laptops use Playwright's. */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});

const PROBE = () => {
  const out = [];
  const name = (el) => {
    const c = (el.className?.baseVal ?? el.className ?? '').toString().split(' ')[0];
    return c ? `.${c}` : el.tagName.toLowerCase();
  };
  const shown = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.08) return false;
    }
    const r = el.getBoundingClientRect();
    // Over a pixel each way: a 1px box is the screen reader's copy (`.sr-only`), not text.
    return r.width > 1 && r.height > 1;
  };
  const clipsX = (cs) => /hidden|clip/.test(cs.overflowX);
  const scrollsX = (cs) => /auto|scroll/.test(cs.overflowX);

  /* 1. Boxes that hold more than they show, with no ellipsis to say so. */
  for (const el of document.querySelectorAll('button,a,label,span,p,h1,h2,h3,h4,h5,strong,small,b,em,li')) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    // Overflow left visible is caught by the parent check below.
    if (!clipsX(cs)) continue;
    if (cs.textOverflow === 'ellipsis' || scrollsX(cs)) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.push({ kind: 'CLIPPED', what: name(el), text: (el.textContent ?? '').trim().slice(0, 40), by: el.scrollWidth - el.clientWidth });
    }
  }

  /*
   * 1b. Words cut with an ellipsis where they had room to wrap.
   *
   * An ellipsis is a decision, so it is allowed only where it was made: the places listed
   * in ONE_LINE, each of which has a reason (a control that must not change height under
   * your thumb, a chip in a row). Anywhere else, an echo's title in a panel or a list cut to
   * "It was invented to ..." is the same defect as a cut, just politer (James, 2026-11-10:
   * the flight's Coming up panel). Titles wrap to two lines first.
   */
  const ONE_LINE = [
    '.echobar-tap strong',   // the bar: a title that wraps moves the arrows between presses
    '.echobar-place',        // its second line, the same reason
    '.jchip-label',          // a chip in the map bar's one row
    '.test-position',        // the developer banner for ?at=
    '.jchip-ribbon *',       // a route's name in the journey chip
    '.echobar-kicker *',     // the bar's kind and rarity, before its "1 of 30"
    '.pop-where',            // on a short phone the card's place gives up its second line
  ];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0 && !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis' || !clipsX(cs)) continue;
    if (!shown(el) || el.scrollWidth <= el.clientWidth + 1) continue;
    const allowed = ONE_LINE.some((sel) => sel.endsWith(' *')
      ? el.parentElement?.closest(sel.slice(0, -2))
      : el.matches(sel));
    if (allowed) continue;
    out.push({ kind: 'ELLIPSIZED', what: name(el), text: (el.textContent ?? '').trim().slice(0, 40), by: el.scrollWidth - el.clientWidth });
  }

  /*
   * 1c. A short label broken over two lines: "20 min" as "20" above "min". A time, a
   * count or a two-word button that wraps is a column too narrow for it, not a paragraph.
   */
  {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const text = t.textContent.trim();
      if (!text || text.length > 10 || !/\s/.test(text) || !t.parentElement || !shown(t.parentElement)) continue;
      if (t.parentElement.closest('svg, [aria-hidden="true"]')) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) out.push({ kind: 'WRAPPED', what: name(t.parentElement), text, by: tops.size });
    }
  }

  /* 2. Text reaching past an ancestor that cuts it off. */
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    const host = t.parentElement;
    if (!text || !host || !shown(host)) continue;
    if (host.closest('svg, script, style, [aria-hidden="true"], .maplibregl-ctrl-attrib')) continue;
    const hcs = getComputedStyle(host);
    if (hcs.textOverflow === 'ellipsis') continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) continue;
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    for (let a = host; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (scrollsX(cs)) break;
      if (!clipsX(cs) && a !== document.body) continue;
      if (cs.textOverflow === 'ellipsis') break;
      const box = a === document.body ? { left: 0, right: innerWidth } : a.getBoundingClientRect();
      const bl = cs.borderLeftWidth ? parseFloat(cs.borderLeftWidth) : 0;
      const br = cs.borderRightWidth ? parseFloat(cs.borderRightWidth) : 0;
      const by = Math.max(box.left + bl - left, right - (box.right - br));
      if (by > 1.5) {
        out.push({ kind: 'CUT BY A PARENT', what: `${name(host)} in ${name(a)}`, text: text.slice(0, 40), by: Math.round(by) });
        break;
      }
    }
  }

  /*
   * 3. Placeholders wider than their input.
   *
   * Measured by the input itself: the placeholder goes in as the value for a moment, and
   * the input's own scroll width says whether it fits. A canvas measurement of the same
   * string said it fitted with 7px to spare, because a search field keeps room for its
   * clear button that no stylesheet mentions. Put back at once, and never dispatched as
   * an event, so the app does not see it.
   */
  for (const el of document.querySelectorAll('input[placeholder]')) {
    if (!shown(el) || el.value || !el.placeholder) continue;
    el.value = el.placeholder;
    const need = el.scrollWidth, room = el.clientWidth;
    el.value = '';
    if (need > room + 1) out.push({ kind: 'PLACEHOLDER', what: name(el), text: el.placeholder, by: need - room });
  }
  return out;
};

const failures = new Map();
/** Screens the walk was meant to reach and did not. */
const unreached = [];
const errors = [];

async function device(geo, seed = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
    ...(geo ? { permissions: ['geolocation'], geolocation: geo } : {}),
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('clip-seeded')) return;
    sessionStorage.setItem('clip-seeded', '1');
    if (s.onboarded) {
      localStorage.setItem('echo-finders:onboarded', '1');
      localStorage.setItem('echo-finders:how-echoes-unlock', '1');
    }
  }, seed);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  const look = async (screen) => {
    await p.evaluate(() => document.fonts.ready);
    for (const f of await p.evaluate(PROBE)) {
      const key = `${f.kind}|${f.what}|${f.text}`;
      if (!failures.has(key)) failures.set(key, { ...f, screen });
    }
  };
  return { ctx, p, look };
}
const tap = (l) => l.first().click({ timeout: 3000 }).catch(() => {});

// First run, and its search.
{
  const { ctx, p, look } = await device({ latitude: 34.2357, longitude: -77.9452 });
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await look('first run');
  await p.getByLabel('Search a city or ZIP code').fill('Wilm').catch(() => {});
  await p.waitForTimeout(400);
  await look('first run, searching');
  await p.getByLabel('Search a city or ZIP code').fill('').catch(() => {});
  await tap(p.getByRole('button', { name: 'Find echoes near me' }));
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(600);
  await look('how echoes unlock');
  await ctx.close();
}

// Where are you? No answer about the location.
{
  const { ctx, p, look } = await device(null, { onboarded: true });
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await look('where are you');
  await ctx.close();
}

// The map near echoes, its card, search, trip sheet, the tabs.
{
  const { ctx, p, look } = await device({ latitude: 34.2357, longitude: -77.9452 }, { onboarded: true });
  await p.goto(`${BASE}/?at=34.2357,-77.9452`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) await p.locator('.synced-later').click({ timeout: 500 }).catch(() => {});
  await tap(p.getByLabel(/^Show me the map|the street map/));
  await p.waitForTimeout(800);
  await look('map');
  await tap(p.locator('.kind-tap'));
  await p.waitForTimeout(300);
  await look('map, filter open');
  await p.keyboard.press('Escape');
  await tap(p.locator('.echobar-tap'));
  await p.waitForTimeout(700);
  await look('echo card');
  await tap(p.locator('.pop-close'));
  await p.waitForTimeout(300);
  const box = p.getByLabel('Search a city, place or ZIP code');
  for (const q of ['ne', 'boston', '28401']) {
    await box.click().catch(() => {});
    await box.fill(q).catch(() => {});
    await p.waitForTimeout(900);
    await look(`map search "${q}"`);
  }
  await tap(p.getByRole('button', { name: 'Close search' }));
  await p.waitForTimeout(300);
  // Whatever a search step left open, a card or a toast, out of the way of the trip sheet.
  for (let i = 0; i < 3; i++) await p.locator('.toast-close').first().click({ timeout: 500 }).catch(() => {});
  await p.locator('.pop-close').click({ force: true, timeout: 1000 }).catch(() => {});
  await p.waitForTimeout(300);
  await tap(p.getByLabel(/Change your journey/));
  await p.waitForTimeout(500);
  for (const m of ['Walk', 'Drive', 'Fly']) {
    await tap(p.locator('.jmenu').getByRole('button', { name: m, exact: true }));
    await p.waitForTimeout(300);
    await look(`trip sheet, ${m}`);
  }
  // A flight, the whole journey: its Coming up panel. Asserted, not hoped for: a step
  // that silently misses its screen is an audit that silently passes.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await tap(p.getByLabel(/Change your journey/));
  await p.waitForTimeout(400);
  await tap(p.locator('.jmenu').getByRole('button', { name: 'Fly', exact: true }));
  await p.waitForTimeout(300);
  await tap(p.locator('.jmenu .jmenu-item'));
  await p.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) await p.locator('.toast-close').first().click({ timeout: 500 }).catch(() => {});
  if (!(await p.locator('.upnext').count())) unreached.push('a flight, coming up');
  await look('a flight, coming up');
  await tap(p.locator('.nav button').nth(1));
  await p.waitForTimeout(600);
  await look('my echoes');
  await tap(p.locator('.nav button').nth(2));
  await p.waitForTimeout(600);
  await look('settings');
  await ctx.close();
}

const rows = [...failures.values()];
console.log(`\n=== text and icons cut off at 375x667 (${rows.length}) ===`);
for (const f of rows) console.log(`  ${f.kind}  ${f.what} "${f.text}" by ${f.by}px (${f.screen})`);
if (!rows.length) console.log('  none');
if (unreached.length) console.log(`\nNEVER REACHED: ${unreached.join(', ')}`);
console.log('\nPAGE ERRORS:', errors.length ? [...new Set(errors)].join('\n  ') : 'none');
await browser.close();
shutdown();
process.exit(rows.length || unreached.length ? 1 : 0);
