/**
 * The design's measurements, checked against the running app.
 *
 * "Match the design exactly" was asked for twice, and both times the only way to answer was
 * to look at two screens and have an opinion. This turns it into a number. Each row below is
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
  // On the map, with the sheet at its usual height.
  { design: '.grab i', ours: '.grab', where: 'map',
    want: { width: '38px', height: '4px', borderTopLeftRadius: '99px' } },
  { design: '.tabs button', ours: '.seg', where: 'map',
    want: { flexGrow: '1', paddingTop: '10px', paddingBottom: '10px', fontSize: '11px' } },
  { design: '.tabs .count', ours: '.seg-count', where: 'map',
    want: { marginLeft: '5px', fontSize: '9.5px', borderTopLeftRadius: '99px' } },
  { design: '.list', ours: '.list', where: 'map',
    want: { paddingTop: '12px', paddingRight: '14px', paddingBottom: '16px', paddingLeft: '14px', rowGap: '9px' } },
  /*
   * The design's `.card` is our `.ecard` in the sheet, and only its shell is asserted here.
   * Its 12px/13px padding and 13.5px title are deliberately not: the sheet list was
   * rebuilt denser on purpose, after "isn't this a waste of space", and the design's card
   * is still what the package screen uses, where it is measured in full below.
   */
  { design: '.card (shell)', ours: '.ecard', where: 'map',
    want: { borderTopLeftRadius: '14px', borderTopWidth: '1px' } },
  { design: '.card p', ours: '.ecard-detail p', where: 'map',
    want: { fontSize: '11px', lineHeight: '16.5px' } },
  { design: '.nav', ours: '.nav', where: 'map',
    want: { height: '74px', paddingBottom: '14px' } },
  { design: '.nav button', ours: '.nav button', where: 'map',
    want: { flexGrow: '1', flexDirection: 'column', rowGap: '4px', fontSize: '9.5px', letterSpacing: '0.285px' } },
  { design: '.nav button svg', ours: '.nav button svg', where: 'map',
    want: { width: '20px', height: '20px', strokeWidth: '1.7px' } },

  // The now-playing row. The design calls it `.now`; here it is the player's own header,
  // which is the same row in the same place doing the same job.
  { design: '.play', ours: '.playing-orb', where: 'playing',
    want: { width: '46px', height: '46px', borderTopLeftRadius: '50%' } },
  { design: '.play svg', ours: '.playing-orb svg', where: 'playing',
    want: { width: '19px', height: '19px' } },
  { design: '.nowtxt h5', ours: '.playing-text strong', where: 'playing',
    want: { fontSize: '13.5px', fontWeight: '500', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } },
  { design: '.nowtxt p', ours: '.playing-place', where: 'playing',
    want: { fontSize: '10.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } },
  { design: '.tag', ours: '.playing-kicker', where: 'playing',
    want: { fontSize: '9px', letterSpacing: '1.26px', textTransform: 'uppercase', fontWeight: '500' } },
  { design: '.tag .dot', ours: '.playing-dot', where: 'playing',
    want: { width: '6px', height: '6px', borderTopLeftRadius: '50%' } },
  { design: '.savebtn', ours: '.phead-mark', where: 'playing',
    want: { width: '38px', height: '38px', borderTopLeftRadius: '12px' } },
  { design: '.savebtn svg', ours: '.phead-mark svg', where: 'playing',
    want: { width: '16px', height: '16px', strokeWidth: '1.8px' } },

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
    want: { fontSize: '10px' } },
  { design: '.place', ours: '.ecard-place', where: 'plan',
    want: { marginTop: '8px', fontSize: '10px', columnGap: '5px' } },
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
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
  hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 40.7033, longitude: -74.0170 } });
const p = await ctx.newPage();
await p.route('**://server.arcgisonline.com/**', r => r.fulfill({ contentType: 'image/svg+xml',
  body: r.request().url().includes('Light') ? tile('#e8eaee', '#cfd4dc') : tile('#262b34', '#343b47') }));

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(800);
for (let i = 0; i < 9 && await p.locator('.onb').count(); i++) {
  const start = p.getByRole('button', { name: /Start looking/ });
  const allow = p.getByRole('button', { name: /Allow location/ });
  if (await start.count()) await start.click();
  else if (await allow.count()) { await allow.click(); await p.waitForTimeout(1500); }
  else await p.locator('.onb-go').first().click();
  await p.waitForTimeout(400);
}
await p.waitForTimeout(4500);
// Walking now opens on the rose with the sheet at one row, so raise it before reaching for
// anything in the list.
for (let i = 0; i < 4 && !(await p.locator('.list').isVisible().catch(() => false)); i++) {
  await p.locator('.grab-zone').click();
  await p.waitForTimeout(500);
}
// Open a row so a card, its actions and the transport are all on screen at once.
await p.locator('.erow-body').first().click();
await p.waitForTimeout(500);

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
await phase('playing', async () => {
  await p.locator('.erow-plate').first().click();
  await p.waitForTimeout(2200);
});
/*
 * The design's full card lives on the package screen, which is now somewhere you go rather
 * than a gate you pass: the map opens first, and the package is behind the rail's download
 * button. The sheet has to come down first, because the control column fades as it rises.
 */
await phase('plan', async () => {
  // An open echo stands the rail down, which is deliberate. Close it first.
  if (await p.locator('.pop-close').count()) {
    await p.locator('.pop-close').click();
    await p.waitForTimeout(300);
  }
  for (let i = 0; i < 4 && !(await p.locator('.sheet-peek').count()); i++) {
    await p.locator('.grab-zone').click();
    await p.waitForTimeout(500);
  }
  await p.getByLabel(/Download this journey|Your journey/).click();
  await p.waitForTimeout(700);
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
