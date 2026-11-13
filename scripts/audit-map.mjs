#!/usr/bin/env node
/**
 * The map's own chrome, measured: the off-screen Rare marker, the trip and topics buttons,
 * the player's Next and the echo bar's time on a flight.
 *
 *   npm run audit:map
 *   MAP_URL=http://127.0.0.1:5173 node scripts/audit-map.mjs    against a running server
 *   MAP_ONLY=20,26 node scripts/audit-map.mjs                   some of the checks
 *
 * Written for the web questions James approved on 2026-11-13, one check each, each of which
 * failed on the app as it was:
 *
 *   20  "EXTRA RARE" never touches the marker's arrow
 *   26  the marker never sits over a pin or a group, and a tap on a pin reaches the pin
 *   30  the trip button keeps its whole label; the topics button gives way, icon showing
 *   21  the player's Next is dimmed and does nothing when nothing is queued, and works when
 *       something is
 *   25  on a flight the echo bar and Coming up give the same minutes for the same echo
 *   XR  Extra rare pins are magenta and 1.15x (option D); Rare stays ember
 *   TAG the labels under Rare and Extra rare pins never print over each other
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4193;
let BASE = process.env.MAP_URL;
if (!BASE) {
  BASE = `http://127.0.0.1:${PORT}`;
  spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
  process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} });
}
BASE = BASE.replace(/\/$/, '');
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/`)).ok) break; } catch {}
  await sleep(500);
}
const ONLY = process.env.MAP_ONLY ? new Set(process.env.MAP_ONLY.split(',')) : null;
const runs = (id) => !ONLY || ONLY.has(id);

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});

const failures = [];
const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures.push(name);
};

/** A phone at `geo`, past the first run, on the map. */
async function phone(geo, { width = 390, height = 844, query = '' } = {}) {
  const ctx = await browser.newContext({
    colorScheme: 'dark', viewport: { width, height }, isMobile: true, hasTouch: true,
    permissions: ['geolocation'], geolocation: geo,
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(1500);
  return { ctx, p };
}

/** Somewhere else, with the same phone: a test position (`test-position.ts`). */
async function standAt(p, at) {
  await p.goto(`${BASE}/?at=${at}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  // The synced toast sits over the top of the map; it is not what is measured here.
  await p.locator('.toast-synced .toast-close').click({ timeout: 500 }).catch(() => {});
  await p.waitForTimeout(200);
}

// 20. "EXTRA RARE" clear of its arrow, on both edges (Philadelphia, right then left).
if (runs('20')) {
  const { ctx, p } = await phone({ latitude: 39.947, longitude: -75.1471 });
  const seen = new Set();
  for (const at of ['39.9420,-75.1540', '39.9470,-75.1471']) {
    await standAt(p, at);
    const marks = await p.$$eval('.map-edge', (gs) => gs.map((g) => {
      const t = g.querySelector('.map-edge-text').getBoundingClientRect();
      const a = g.querySelector('.map-edge-arrow').getBoundingClientRect();
      const plate = g.querySelector('.map-edge-plate').getBoundingClientRect();
      const right = /right edge/.test(g.getAttribute('aria-label'));
      return {
        label: g.querySelector('.map-edge-text').textContent, right,
        // The space between the words and the arrow, on whichever side the arrow is.
        gap: right ? a.left - t.right : t.left - a.right,
        inside: t.left >= plate.left && t.right <= plate.right,
      };
    }));
    for (const m of marks) {
      if (!/rare/i.test(m.label)) continue;
      seen.add(`${m.label} ${m.right ? 'right' : 'left'}`);
      check(`20  "${m.label}" clear of its arrow, ${m.right ? 'right' : 'left'} edge, at ${at}`,
        m.gap >= 8 && m.inside, `${m.gap.toFixed(1)}px between the words and the arrow`);
    }
  }
  check('20  an Extra rare marker was measured on both edges',
    seen.has('Extra rare right') && seen.has('Extra rare left'), [...seen].join(', '));
  await ctx.close();
}

// 26. The marker clear of every pin and group, and taps on pins reach the pins. The sweep of
//     the findings: five by five around Philadelphia and Lower Manhattan, plus the two above.
if (runs('26')) {
  const { ctx, p } = await phone({ latitude: 39.947, longitude: -75.1471 });
  const spots = ['39.9420,-75.1540', '39.9470,-75.1471'];
  for (const [la, ln] of [[39.948, -75.15], [40.714, -74.014]]) {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      spots.push(`${(la + i * 0.003).toFixed(4)},${(ln + j * 0.004).toFixed(4)}`);
    }
  }
  let measured = 0;
  for (const at of spots) {
    await standAt(p, at);
    const bad = await p.$$eval('.map-edge', (gs) => gs.flatMap((g) => {
      const plate = g.querySelector('.map-edge-plate').getBoundingClientRect();
      const out = [];
      for (const hit of document.querySelectorAll('.pin-hit')) {
        if (g.contains(hit)) continue;
        const q = hit.getBoundingClientRect();
        if (!q.width) continue;
        const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
        // A pin's own disc is 13 to 15px; a group's is up to 26. Its centre that close to
        // the plate means the plate is drawn over it.
        const r = Math.min(q.width / 2, 26) - 9;
        const under = cx > plate.left - r && cx < plate.right + r && cy > plate.top - r && cy < plate.bottom + r;
        const top = document.elementFromPoint(cx, cy);
        const stolen = !!top && !!top.closest('.map-edge');
        if (under || stolen) {
          const name = hit.parentElement.getAttribute('aria-label') ?? 'a pin';
          out.push(`${name.slice(0, 40)}${stolen ? ' (tap goes to the marker)' : ''}`);
        }
      }
      return out;
    }));
    measured += await p.locator('.map-edge').count();
    check(`26  the marker clear of pins at ${at}`, bad.length === 0, bad.join('; '));
  }
  check('26  markers were on screen to measure', measured >= 20, `${measured}`);
  await ctx.close();
}

// 30. The trip button keeps its whole name; the topics button gives way, its icon showing.
if (runs('30')) {
  const cases = [['All echoes', []], ['Ghosts & legends', ['Ghosts & legends']], ['Food & drink', ['Food & drink']],
    ['two topics', ['Ghosts & legends', 'True crime']]];
  for (const width of [375, 390, 440]) {
    const { ctx, p } = await phone({ latitude: 40.70556, longitude: -74.01705 }, { width });
    for (const trip of ['Walking nearby', 'Driving nearby']) {
      if (trip === 'Driving nearby') {
        await p.getByLabel(/Change your journey/).click();
        await p.locator('.jmenu').getByRole('button', { name: 'Drive', exact: true }).click();
        await p.locator('.jmenu-card', { hasText: 'Around here' }).click();
        await p.waitForTimeout(800);
      }
      for (const [name, picks] of cases) {
        await p.locator('.kind-tap').click();
        await p.locator('.kind-box button', { hasText: /^All$/ }).click();
        for (const t of picks) await p.locator('.kind-box button').filter({ hasText: new RegExp(`^${t}$`) }).first().click();
        if (await p.locator('.kind-box').count()) await p.keyboard.press('Escape');
        await p.waitForTimeout(300);
        const m = await p.evaluate(() => {
          const r = (el) => el?.getBoundingClientRect();
          const label = document.querySelector('.mapbar-row > .jchip-wrap .jchip-label');
          const tap = document.querySelector('.kind-tap');
          const glyph = tap.querySelector('.kind-glyph');
          const chev = tap.querySelector('.kind-chev');
          const words = tap.querySelector('.kind-label');
          const t = r(tap), g = r(glyph), c = r(chev), w = r(words);
          return {
            trip: label.textContent,
            tripWhole: label.scrollWidth <= label.clientWidth,
            rowFits: t.right <= innerWidth - 16 + 0.5,
            glyph: !glyph || (g.width > 0 && g.left >= t.left && g.right <= t.right),
            chev: c.width > 0 && c.right <= t.right,
            wordsFit: w.right <= c.left + 0.5,
            cut: words.scrollWidth > words.clientWidth,
            ellipsis: getComputedStyle(words).textOverflow === 'ellipsis',
          };
        });
        const tag = `30  ${width}, ${trip}, ${name}`;
        check(`${tag}: trip button says "${m.trip}" whole`, m.tripWhole && m.trip === trip, m.trip);
        check(`${tag}: topics button inside the row, icon and chevron showing`, m.rowFits && m.glyph && m.chev,
          JSON.stringify(m));
        check(`${tag}: topics words end before the chevron, ellipsised when cut`,
          m.wordsFit && (!m.cut || m.ellipsis), JSON.stringify(m));
      }
    }
    await ctx.close();
  }
}

// 21. Next with nothing queued: dimmed, and pressing it does not end the echo.
if (runs('21')) {
  const { ctx, p } = await phone({ latitude: 39.947, longitude: -75.147 });
  await p.goto(`${BASE}/?at=philadelphia-where-evangeline-was-buried`, { waitUntil: 'domcontentloaded' });
  await p.locator('.toast-synced .toast-play').first().click({ timeout: 15000 });
  await p.waitForTimeout(1200);
  const next = p.locator('button[aria-label="Next echo"]');
  check('21  the player is open', (await p.locator('.hear-go').count()) === 1);
  check('21  Next is disabled with nothing queued', await next.isDisabled().catch(() => false));
  check('21  and dimmed as the player dims a control it cannot use',
    (await next.evaluate((e) => getComputedStyle(e).opacity).catch(() => '1')) === '0.4');
  await next.click({ force: true }).catch(() => {});
  await p.waitForTimeout(800);
  check('21  pressing it does not stop the echo', (await p.locator('.hear-go').count()) === 1);
  await ctx.close();
}

// 21. Next with something queued: enabled, and it moves on. Wilmington, the Old Wilmington
//     walk with "Play these as I reach them" on and every echo chosen, then standing at the
//     Bellamy Mansion, where several echoes sync at once and the rest queue behind the first.
if (runs('21')) {
  const { ctx, p } = await phone({ latitude: 34.2357, longitude: -77.9452 });
  await p.getByLabel(/Change your journey/).click();
  await p.getByRole('button', { name: /Journey details/ }).click();
  await p.getByRole('button', { name: /^Riverwalk at Market Street/ }).click();
  await p.locator('.pf-alt').first().click();
  await p.getByRole('button', { name: 'All', exact: true }).click();
  // By keyboard: the switch sits under the plan's sticky footer at this height.
  await p.getByRole('button', { name: /Play these as I reach them/ }).focus();
  await p.keyboard.press('Enter');
  await p.locator('button[aria-label*="ack"], button[aria-label*="lose"]').first().click();
  const bellamy = { latitude: 34.23593, longitude: -77.9429 };
  for (let i = 0; i < 14; i++) {
    await ctx.setGeolocation({ ...bellamy, latitude: bellamy.latitude + (i % 2) * 0.00001 });
    await p.waitForTimeout(700);
  }
  await p.locator('.toast-synced .toast-play').first().click({ timeout: 10000 });
  await p.waitForTimeout(1000);
  const next = p.locator('button[aria-label="Next echo"]');
  const before = await p.locator('.hear h1, h1').first().innerText().catch(() => '');
  check('21  Next is enabled with echoes queued', (await next.count()) === 1 && !(await next.isDisabled()));
  await next.click().catch(() => {});
  await p.waitForTimeout(1000);
  const after = await p.locator('.hear h1, h1').first().innerText().catch(() => '');
  check('21  and moves on to the next echo', (await p.locator('.hear-go').count()) === 1 && after !== before && after !== '',
    `${before} then ${after}`);
  await ctx.close();
}

// 25. Flying JFK to MIA: the echo bar and Coming up agree, to the minute, about the same echo.
if (runs('25')) {
  const { ctx, p } = await phone({ latitude: 40.70556, longitude: -74.01705 });
  await p.getByLabel(/Change your journey/).click();
  await p.locator('.jmenu-mode', { hasText: 'Fly' }).click();
  await p.locator('.jmenu .jmenu-routes .jmenu-item').first().click();
  await p.waitForTimeout(2500);
  const trip = await p.getByLabel(/Change your journey/).getAttribute('aria-label');
  check('25  flying JFK to MIA', /MIA|Miami/.test(trip ?? ''), trip);
  // Held still, so the two are read at the same moment of the flight.
  await p.getByRole('button', { name: /^Pause/ }).first().click().catch(() => {});
  const rows = await p.locator('.upnext li, .upnext-row').evaluateAll((ls) => ls.map((l) => l.innerText));
  const up = await p.locator('.upnext').innerText().catch(() => '');
  check('25  Coming up is showing', /coming up/i.test(up), up);
  const items = [...up.matchAll(/(\d+) min\n([^\n]+)/g)].map((m) => ({ min: +m[1], title: m[2] }));
  check('25  Coming up names an echo', items.length > 0, JSON.stringify(rows));
  for (const item of items) {
    let bar = '';
    for (let i = 0; i < 40; i++) {
      bar = await p.locator('.echobar').innerText();
      if (bar.includes(item.title)) break;
      await p.locator('.echobar').getByRole('button', { name: /Next/i }).first().click();
      await p.waitForTimeout(150);
    }
    // Both read in the same instant: the simulated flight keeps moving.
    const [nowBar, nowUp] = await p.evaluate(() => [document.querySelector('.echobar').innerText,
      document.querySelector('.upnext').innerText]);
    const said = /(\d+) min ·/.exec(nowBar);
    const listed = [...nowUp.matchAll(/(\d+) min\n([^\n]+)/g)].find((m) => m[2] === item.title);
    check(`25  "${item.title}": Coming up ${listed ? listed[1] : '?'} min, the echo bar ${said ? said[1] : '?'} min`,
      nowBar.includes(item.title) && said && listed && said[1] === listed[1], JSON.stringify([nowBar, nowUp]));
  }
  await ctx.close();
}

// XR. Extra rare pins in magenta, 1.15x, label magenta; Rare stays ember (Savannah, both themes).
if (runs('XR')) {
  for (const theme of ['dark', 'light']) {
    const { ctx, p } = await phone({ latitude: 32.0733, longitude: -81.0897 });
    await p.emulateMedia({ colorScheme: theme });
    await standAt(p, '32.0733,-81.0897');
    const m = await p.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const ink = (v) => { const d = document.createElement('div'); d.style.color = css.getPropertyValue(v); document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const pin = (rarity) => [...document.querySelectorAll('.pin')].find((g) => g.querySelector(`:scope > .pin-halo-${rarity}`) && g.querySelector(':scope > .echo-char'));
      const look = (g) => g && {
        scale: getComputedStyle(g.querySelector(':scope > .echo-char')).transform,
        glow: getComputedStyle(g.querySelector('[id^="ecGlow-"] stop')).stopColor,
        body: getComputedStyle(g.querySelector('[id^="ecBody-"] stop:nth-child(3)')).stopColor,
        tag: g.querySelector('.pin-tag') && getComputedStyle(g.querySelector('.pin-tag')).fill,
      };
      return {
        magenta: ink('--magenta'), magentaInk: ink('--magenta-ink'),
        halo: getComputedStyle(document.querySelector('#raritySingular stop')).stopColor,
        xr: look(pin('singular')), rare: look(pin('rare')),
      };
    });
    const tag = `XR  ${theme}`;
    check(`${tag}: an Extra rare and a Rare pin on screen`, !!m.xr && !!m.rare, JSON.stringify(m));
    if (!m.xr || !m.rare) { await ctx.close(); continue; }
    check(`${tag}: Extra rare creature 1.15x`, m.xr.scale === 'matrix(1.15, 0, 0, 1.15, 0, 0)', m.xr.scale);
    check(`${tag}: its glow magenta, its body the approved ramp`, m.xr.glow === m.magenta && m.xr.body === 'rgb(200, 19, 106)',
      JSON.stringify(m.xr));
    check(`${tag}: its label magenta (--magenta-ink, ${m.magentaInk})`, m.xr.tag === m.magentaInk, `${m.xr.tag} vs ${m.magentaInk}`);
    check(`${tag}: the Extra rare halo magenta`, m.halo === m.magenta, m.halo);
    check(`${tag}: Rare stays ember, same size`, m.rare.scale === 'none' && m.rare.glow !== m.magenta && m.rare.tag !== m.magentaInk,
      JSON.stringify(m.rare));
    await ctx.close();
  }
}

// TAG. Pin labels never print over each other (Savannah, where two Rare labels did).
if (runs('TAG')) {
  const { ctx, p } = await phone({ latitude: 32.0733, longitude: -81.0897 });
  for (const at of ['32.0733,-81.0897', '32.0760,-81.0920', '32.0710,-81.0870']) {
    await standAt(p, at);
    const tags = await p.$$eval('.pin-tag', (ts) => ts
      .filter((t) => getComputedStyle(t).visibility !== 'hidden')
      .map((t) => { const r = t.getBoundingClientRect(); return { text: t.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    const clash = [];
    for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i], b = tags[j];
      if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) clash.push(`"${a.text}" on "${b.text}"`);
    }
    check(`TAG  pin labels clear of each other at ${at}`, clash.length === 0, clash.join('; '));
    if (at === '32.0733,-81.0897') {
      check('TAG  the Extra rare label is kept', tags.some((t) => /^Extra rare/.test(t.text)), JSON.stringify(tags.map((t) => t.text)));
    }
  }
  await ctx.close();
}

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? [...new Set(errors)].join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('map: all good');
process.exit(0);
