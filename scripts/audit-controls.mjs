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
 *
 * It also fails on any page error thrown along the way, which is how a broken screen deep
 * in a flow gets noticed without anybody opening it.
 *
 * It found the rate stepper at 16x14 and the transcript search at 15px tall, neither of
 * which anybody had looked at twice.
 *
 *   npm run build -w @echofinders/prototype
 *   npx vite preview --port 4173 --host 127.0.0.1 &
 *   node scripts/audit-controls.mjs
 *
 * Colour contrast is a separate script (`check-contrast.py`) because it reads the
 * stylesheet rather than the running app.
 */

import { chromium } from 'playwright';
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
    });
  }
  return out;
});

const screens = {};
const capture = async (label) => { screens[label] = await inventory(); };

await p.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
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
await p.locator('.sheet .seg', {hasText:'Saved'}).click(); await p.waitForTimeout(500);
await capture('sheet/saved');
await p.locator('.nav button').nth(1).click(); await p.waitForTimeout(700); await capture('my-echoes');
await p.locator('.nav button').nth(2).click(); await p.waitForTimeout(700); await capture('settings');
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
const fail = { unnamed: [], small: [], tooltip: [] };
for (const [, it] of seen) {
  if (!it.name) fail.unnamed.push(it);
  if (it.w < 24 || it.h < 24) fail.small.push(it);
  if (it.title) fail.tooltip.push(it);
}
const show = (label, list) => console.log(`${label}: ${list.length ? list.map(i=>`${i.cls} "${i.name}" ${i.w}x${i.h} (${i.screen})`).join('\n    ') : 'none'}`);
show('WITHOUT ACCESSIBLE NAME', fail.unnamed);
show('UNDER 24x24 (WCAG 2.5.8)', fail.small);
show('NATIVE TOOLTIP', fail.tooltip);
console.log('\nPAGE ERRORS:', errors.length ? [...new Set(errors)].join('\n  ') : 'none');
await b.close();
