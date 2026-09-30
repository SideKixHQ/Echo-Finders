/**
 * The design's measurements, checked against the running app.
 *
 * "Match the design exactly" was asked for twice, and both times the only way to answer was
 * to look at two screens and have an opinion. This turns it into a number. Each row below is
 * NOTE, September 2026: the type sizes here no longer match the prototype HTML, on
 * purpose. The prototype set labels as small as 8.5px, which is below Apple's 11pt
 * floor, and on a 390pt phone one CSS pixel is one point. Everything under 11px was
 * raised, `design/SPEC.md` was raised with it, and `audit-controls.mjs` now fails on
 * anything under 11px so it cannot drift back. Do not "restore" these from the
 * prototype: the prototype is the older document.
 *
 * a measurement taken out of `design/echo-finders-phone.prototype.html` (and written down in
 * `design/SPEC.md`), paired with the selector that carries it here, and the script reads the
 * computed style in a real browser and prints the difference.
 *
 * Computed style rather than the stylesheet, deliberately: a rule that exists and is
 * overridden is the failure mode this is for. Two of the padding bugs earlier were exactly
 * that, a correct declaration losing on source order to one written eight hundred lines
 * away.
 *
 * Only properties the design actually fixes. Anything the design leaves to flow is left
 * alone here, because asserting it would be inventing a requirement and then meeting it.
 *
 *   npm run audit:spec
 */

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4174;
spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
const shutdown = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
process.on('exit', shutdown);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}

/**
 * Each entry: the design's selector, ours, and the properties the design pins.
 *
 * `where` is the screen it has to be measured on, because most of these do not exist until
 * something is playing.
 */
const SPEC = [
  /*
   * THE SHEET AND ITS LIST ARE GONE, and with them six measurements that used to live
   * here: the grab handle, the two tab rules, the list padding and the card shell.
   *
   * Not a regression against the design, a decision taken against it. The design draws a
   * three-detent sheet over the map; measured on a real phone that sheet, the stepper, the
   * proximity strip and the tab bar left the map a fifth of the screen, on a product whose
   * whole proposition is looking at what is around you. One bar replaced the three strips
   * (`EchoBar`), and the sheet's contents went where they were already better served: the
   * transcript onto the player, saved under My Echoes, the nearby list onto two arrows.
   *
   * The design's own card is still measured in full on the package screen below, which is
   * where it now lives, so the rules themselves are still held to.
   */
  { design: '.nav', ours: '.nav', where: 'map',
    want: { height: '74px', paddingBottom: '14px' } },
  { design: '.nav button', ours: '.nav button', where: 'map',
    want: { flexGrow: '1', flexDirection: 'column', rowGap: '4px', fontSize: '11px', letterSpacing: '0.33px' } },
  { design: '.nav button svg', ours: '.nav button svg', where: 'map',
    want: { width: '20px', height: '20px', strokeWidth: '1.7px' } },

  /*
   * The design's now-playing row (`.now`) is the bar now, and the bar is a different
   * object on purpose: the design's row is a play orb, a title and a bookmark, and ours
   * also has to carry which echo of how many, how far off it is, and whether you are
   * getting warmer — because it replaced the three strips that used to say those things.
   *
   * What carries over is measured. The orb is 48 rather than the design's 46, because it
   * is the creature rather than a glyph in a circle and a 46px sphere with two eyes in it
   * is smaller than it reads on paper. The kicker keeps the design's 11px uppercase; the
   * dot keeps its 6px.
   */
  { design: '.tag', ours: '.echobar-kicker', where: 'map',
    want: { fontSize: '11px', textTransform: 'uppercase', fontWeight: '500' } },
  { design: '.tag .dot', ours: '.echobar-dot', where: 'map',
    want: { width: '6px', height: '6px', borderTopLeftRadius: '50%' } },
  { design: '.nowtxt h5', ours: '.echobar-tap strong', where: 'map',
    want: { fontWeight: '500', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } },

  // The package screen, which is where the design's full card lives.
  { design: '.card', ours: '.card', where: 'plan',
    want: { borderTopLeftRadius: '14px', paddingTop: '12px', paddingRight: '13px',
            paddingBottom: '12px', paddingLeft: '13px' } },
  { design: '.card h4', ours: '.card h4', where: 'plan',
    want: { fontSize: '13.5px', fontWeight: '500', lineHeight: '18.225px' } },
  { design: '.card p', ours: '.card p', where: 'plan',
    want: { fontSize: '11px', lineHeight: '16.5px' } },
  /* `margin-left: auto` is the design's and is ours everywhere but here: the package card
     carries an ordinal ("3 of 12") that takes the right edge, so the duration sits beside
     it rather than in it. The size is the design's. */
  { design: '.dur', ours: '.dur', where: 'plan',
    want: { fontSize: '11.5px' } },
  { design: '.place', ours: '.ecard-place', where: 'plan',
    want: { marginTop: '8px', fontSize: '11.5px', columnGap: '5px' } },
  { design: '.acts', ours: '.card-foot', where: 'plan',
    want: { columnGap: '6px', marginTop: '10px' } },
  { design: '.act', ours: '.act', where: 'plan',
    want: { paddingTop: '7px', paddingRight: '11px', paddingBottom: '7px', paddingLeft: '11px',
            borderTopLeftRadius: '99px', fontSize: '11px', columnGap: '5px' } },
  { design: '.act svg', ours: '.act svg', where: 'plan',
    want: { width: '13px', height: '13px', strokeWidth: '1.8px' } },
];

const tile = (bg, fg) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${bg}"/><path d="M0 64H256M0 128H256M64 0V256M128 0V256" stroke="${fg}" stroke-width="2" fill="none"/></svg>`);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
/*
   `ignoreHTTPSErrors` so the webfonts actually arrive.

   This sandbox routes HTTPS through a proxy Chromium does not trust, so the Google Fonts
   stylesheet was refused and every measurement below was taken against a fallback sans.
   That is the wrong thing to measure: the 11px floor and the 44px targets are about the
   type that ships, and Sora's metrics are not the system font's. It also put a cert error
   in the PAGE ERRORS list, where a real one would then have been easy to miss.

   Only the test harness trusts it. Nothing about the app changes.
*/
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, ignoreHTTPSErrors: true,
  hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 40.7033, longitude: -74.0170 } });
const p = await ctx.newPage();
await p.route('**://server.arcgisonline.com/**', r => r.fulfill({ contentType: 'image/svg+xml',
  body: r.request().url().includes('Light') ? tile('#e8eaee', '#cfd4dc') : tile('#262b34', '#343b47') }));

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(800);
// Measuring before the webfont lands measures the fallback.
await p.evaluate(() => document.fonts.ready);
for (let i = 0; i < 9 && await p.locator('.onb').count(); i++) {
  const start = p.getByRole('button', { name: /Start looking/ });
  const allow = p.getByRole('button', { name: /Allow location/ });
  if (await start.count()) await start.click();
  else if (await allow.count()) { await allow.click(); await p.waitForTimeout(1500); }
  else {
    /*
      The category step starts EMPTY now, and Continue is disabled until something is
      picked. It used to open with all nine lit, so this walked past it without choosing
      anything — which is exactly the state a listener complained about, and exactly why
      an audit that clicks Continue blind cannot be the thing that notices.
      "All of them" is the one-tap answer the screen offers.
    */
    const all = p.locator('.onb-all');
    if (await all.count() && await all.isEnabled()) { await all.click(); await p.waitForTimeout(200); }
    await p.locator('.onb-go').first().click();
  }
  await p.waitForTimeout(400);
}
await p.waitForTimeout(4500);
// Walking opens on the rose. The map, which is what these measure, is one tap behind it.
await p.getByLabel(/^Show me the map|the street map/).click().catch(() => {});
await p.waitForTimeout(800);

const read = (sel, props) => p.evaluate(([sel, props]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return Object.fromEntries(props.map(k => [k, cs[k]]));
}, [sel, props]);

const off = [];
const missing = [];

/** Get the app into the state a group of measurements needs, then take them. */
const phase = async (name, enter) => {
  const rows = SPEC.filter((r) => r.where === name);
  if (!rows.length) return;
  await enter();
  for (const row of rows) {
    const got = await read(row.ours, Object.keys(row.want));
    if (!got) { missing.push(row); continue; }
    for (const [k, want] of Object.entries(row.want)) {
      if (got[k] !== want) off.push({ ...row, prop: k, want, got: got[k] });
    }
  }
};

await phase('map', async () => {});
/*
 * The design's full card lives on the package screen, which is now somewhere you go rather
 * than a gate you pass: the map opens first, and the package is behind the rail's download
 * button.
 */
await phase('plan', async () => {
  // An open echo stands the rail down, which is deliberate. Close it first.
  if (await p.locator('.pop-close').count()) {
    await p.locator('.pop-close').click();
    await p.waitForTimeout(300);
  }
  await p.getByLabel(/Download this journey|Your journey/).click();
  await p.waitForTimeout(700);
  // A package is a route's worth of echoes, so the package controls only exist once a
  // route is picked. Roaming, which is where walking starts, has none.
  const route = p.locator('.pf-pick:not(.pf-roam)').first();
  if (await route.count()) {
    await route.click();
    await p.waitForTimeout(400);
  }
  await p.locator('.pf-alt').first().click();
  await p.waitForTimeout(700);
});

const checks = SPEC.reduce((n, r) => n + Object.keys(r.want).length, 0);
console.log(`\n=== ${checks} measurements from design/SPEC.md, across ${SPEC.length} components ===\n`);
console.log('NOT ON SCREEN TO MEASURE: ' + (missing.length
  ? missing.map(r => `${r.ours} (${r.design})`).join('\n    ') : 'none'));
console.log('OFF SPEC: ' + (off.length
  ? off.map(r => `${r.ours} (design ${r.design}) ${r.prop}: want ${r.want}, got ${r.got}`).join('\n    ')
  : 'none'));

await b.close();
shutdown();
process.exit(off.length || missing.length ? 1 : 0);
