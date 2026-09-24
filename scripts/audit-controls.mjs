/**
 * Every control in the app, checked against the things a screenshot cannot show.
 *
 * Walks the whole product — onboarding, every sheet detent, every tab, the package screen
 * — and inventories each visible interactive element, then reports the three failures that
 * are invisible to the eye and fatal to somebody relying on assistive technology:
 *
 *   - no accessible name (a button a screen reader announces as "button")
 *   - a target under 24x24 (WCAG 2.5.8), which is also just hard to hit on a pavement
 *   - a native `title` tooltip, which arrives late, covers its neighbour, and on a phone
 *     never arrives at all
 *   - a control painted "on" with nothing in the accessibility tree saying so
 *     (WCAG 4.1.2): a chip that is lit and a chip that is not sound identical
 *   - no visible focus ring under Tab (WCAG 2.4.7), which it checks by actually tabbing
 *     through each screen rather than by reading the stylesheet: a blanket `:focus-visible`
 *     rule written with `:where()` has zero specificity, so a single `outline: none`
 *     anywhere below it silently wins, and that is exactly what had happened twice
 *
 * It also fails on any page error thrown along the way, which is how a broken screen deep
 * in a flow gets noticed without anybody opening it.
 *
 * It found the rate stepper at 16x14 and the transcript search at 15px tall, neither of
 * which anybody had looked at twice.
 *
 *   node scripts/audit-controls.mjs
 *
 * It builds and serves the app itself. It used to expect a `vite preview` already running,
 * and that quietly cost a round: the server was still holding a `dist` from before the fix,
 * so the audit reported a defect that had already been repaired. A harness that can pass or
 * fail against stale output is not a harness.
 *
 * Colour contrast is a separate script (`check-contrast.py`) because it reads the
 * stylesheet rather than the running app.
 */

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4173;
spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
const shutdown = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
process.on('exit', shutdown);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}

const tile=(bg,fg)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${bg}"/><path d="M0 64H256M0 128H256M64 0V256M128 0V256" stroke="${fg}" stroke-width="2" fill="none"/></svg>`);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true,
  hasTouch:true, permissions:['geolocation'], geolocation:{latitude:40.7033,longitude:-74.0170} });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error' && !m.text().includes('ERR_FAILED')) errors.push('console: ' + m.text().slice(0,120)); });
await p.route('**://server.arcgisonline.com/**', r=>r.fulfill({contentType:'image/svg+xml',
  body:r.request().url().includes('Light')?tile('#e8eaee','#cfd4dc'):tile('#262b34','#343b47')}));

/** Every visible interactive element, with everything the audit needs to judge it. */
const inventory = () => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button,[role="button"],[role="slider"],a,input,select,textarea')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g,' ').trim();
    out.push({
      name: name.slice(0, 44),
      cls: (el.className.baseVal ?? el.className ?? '').toString().split(' ')[0],
      w: Math.round(r.width), h: Math.round(r.height),
      disabled: el.hasAttribute('disabled'),
      title: el.hasAttribute('title'),
      // A control that paints itself "on" is telling a sighted person its state. If it
      // does not also say so in the accessibility tree, it is telling nobody else.
      looksOn: /(^|[\s-])on($|[\s-])/.test((el.className.baseVal ?? el.className ?? '').toString()),
      saysState: el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected')
        || el.hasAttribute('aria-current') || el.hasAttribute('aria-checked'),
      role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
    });
  }
  return out;
});

const screens = {};
const capture = async (label) => { screens[label] = await inventory(); };

/**
 * Tab through a screen the way somebody without a mouse has to, and record what the ring
 * looks like on each stop.
 *
 * Reading the stylesheet cannot answer this. `:where(button, ...):focus-visible` has zero
 * specificity by design, which makes it easy to override and easy to override *by
 * accident*: `.tsearch input { outline: none }` is one class and one element, so it beat
 * the blanket rule in every state and the transcript search had no focus ring at all.
 * Nothing but a real Tab shows that.
 *
 * Stops when focus wraps back to where it started, which is also the check that focus is
 * not trapped.
 */
const focusSweep = async (label) => {
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const stops = [];
  let first = null;
  for (let i = 0; i < 80; i++) {
    await p.keyboard.press('Tab');
    const at = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44),
        cls: (el.className.baseVal ?? el.className ?? '').toString().split(' ')[0],
        tag: el.tagName.toLowerCase(),
        // A ring is an outline with width, or a shadow standing in for one. Either is
        // visible; neither is not.
        ring: (parseFloat(cs.outlineWidth) || 0) > 0 && cs.outlineStyle !== 'none',
        shadow: cs.boxShadow !== 'none',
      };
    });
    if (!at) break;
    const key = at.tag + '|' + at.cls + '|' + at.name;
    if (first === null) first = key;
    else if (key === first) break;
    stops.push({ ...at, screen: label });
  }
  return stops;
};
const focus = [];

await p.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
await capture('onboarding/welcome');
// Walk the onboarding, capturing every step.
for (let i=0;i<9 && await p.locator('.onb').count();i++){
  const start = p.getByRole('button',{name:/Start looking/});
  const allow = p.getByRole('button',{name:/Allow location/});
  if (await start.count()) await start.click();
  else if (await allow.count()) { await allow.click(); await p.waitForTimeout(1500); }
  else await p.locator('.onb-go').first().click();
  await p.waitForTimeout(400);
  if (await p.locator('.onb').count()) await capture('onboarding/step' + (i+1));
}
await p.waitForTimeout(4500);
await capture('map/half');
focus.push(...await focusSweep('map/half'));
await p.locator('.erow-body').first().click(); await p.waitForTimeout(500);
await capture('map/row-open');
await p.locator('.erow-plate').first().click(); await p.waitForTimeout(2200);
await capture('map/playing');
const grab = p.locator('.grab-zone');
await grab.click(); await p.waitForTimeout(500); await capture('map/full');
await grab.click(); await p.waitForTimeout(600); await capture('map/peek');
await grab.click(); await p.waitForTimeout(600);
await p.locator('.sheet .seg', {hasText:'Transcript'}).click(); await p.waitForTimeout(500);
await capture('sheet/transcript');
focus.push(...await focusSweep('sheet/transcript'));
await p.locator('.sheet .seg', {hasText:'Saved'}).click(); await p.waitForTimeout(500);
await capture('sheet/saved');
await p.locator('.nav button').nth(1).click(); await p.waitForTimeout(700); await capture('my-echoes');
focus.push(...await focusSweep('my-echoes'));
await p.locator('.nav button').nth(2).click(); await p.waitForTimeout(700); await capture('settings');
focus.push(...await focusSweep('settings'));
await p.locator('.nav button').first().click(); await p.waitForTimeout(600);
await p.getByLabel(/Download this journey|Your journey/).click().catch(()=>{});
await p.waitForTimeout(700); await capture('package');

const all = Object.entries(screens);
const seen = new Map();
for (const [screen, items] of all) for (const it of items) {
  const key = it.name + '|' + it.cls;
  if (!seen.has(key)) seen.set(key, { ...it, screen });
}
console.log(`=== ${seen.size} distinct controls across ${all.length} screens ===\n`);
const fail = { unnamed: [], small: [], tooltip: [], mute: [] };
for (const [, it] of seen) {
  if (!it.name) fail.unnamed.push(it);
  if (it.w < 24 || it.h < 24) fail.small.push(it);
  if (it.title) fail.tooltip.push(it);
  if (it.looksOn && !it.saysState) fail.mute.push(it);
}
const show = (label, list) => console.log(`${label}: ${list.length ? list.map(i=>`${i.cls} "${i.name}" ${i.w}x${i.h} (${i.screen})`).join('\n    ') : 'none'}`);
show('WITHOUT ACCESSIBLE NAME', fail.unnamed);
show('UNDER 24x24 (WCAG 2.5.8)', fail.small);
show('NATIVE TOOLTIP', fail.tooltip);
show('SELECTED BUT SILENT (WCAG 4.1.2)', fail.mute);

const ringless = new Map();
for (const stop of focus) if (!stop.ring && !stop.shadow) ringless.set(stop.cls + '|' + stop.name, stop);
console.log(`NO FOCUS RING (WCAG 2.4.7, ${focus.length} tab stops): ` + (ringless.size
  ? [...ringless.values()].map(i => `${i.tag}.${i.cls} "${i.name}" (${i.screen})`).join('\n    ')
  : 'none'));

console.log('\nPAGE ERRORS:', errors.length ? [...new Set(errors)].join('\n  ') : 'none');
await b.close();
shutdown();
