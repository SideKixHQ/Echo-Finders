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

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? [...new Set(errors)].join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('map: all good');
process.exit(0);
