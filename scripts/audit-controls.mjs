/**
 * Every control in the app, checked against the things a screenshot cannot show.
 *
 * Walks the whole product — onboarding, the map, the card, the player, every tab, the
 * package screen — and inventories each visible interactive element, then reports the three failures that
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
 * Two more checks, added once the designs were measured properly:
 *
 *   - text below 11px. Apple's floor is 11pt, and on a 390pt phone one CSS pixel is one
 *     point, so 11px is the floor here too. This app is read outdoors, in motion, at
 *     arm's length, which argues for the high side of any guideline rather than the low.
 *   - a target a 44px thumb misses. 24x24 is the legal minimum and the app clears it
 *     everywhere; 44 is what Apple asks for. This one is REPORTED, NOT FAILED, because
 *     two families of control cannot reach 44 without wrecking what they are for: the
 *     filter chips sit at 40 in a 48px scrolling row, and map pins overlap each other
 *     by design when echoes are close together. Both are deliberate, both are well
 *     above the legal floor, and both are listed every run so the decision stays
 *     visible rather than quietly rotting into an excuse.
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
import { existsSync } from 'node:fs';
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

/* The cloud sandbox ships its own Chromium; CI and laptops use Playwright's. */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const b = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});
/*
   `ignoreHTTPSErrors` so the webfonts actually arrive.

   This sandbox routes HTTPS through a proxy Chromium does not trust, so the Google Fonts
   stylesheet was refused and every measurement below was taken against a fallback sans.
   That is the wrong thing to measure: the 11px floor and the 44px targets are about the
   type that ships, and Sora's metrics are not the system font's. It also put a cert error
   in the PAGE ERRORS list, where a real one would then have been easy to miss.

   Only the test harness trusts it. Nothing about the app changes.
*/
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, ignoreHTTPSErrors:true,
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
      /*
       * Can a 44px thumb hit this?
       *
       * Not the same question as "is the rectangle 44px". A control may legitimately
       * paint smaller than it listens, which is how Apple's own controls work and how
       * the chip row keeps its density. So probe the eight points on the edge of a
       * 44x44 box centred on the control and ask the page what is actually there. It
       * also catches the opposite lie: a hit area extended so far it steals a
       * neighbour's taps shows up as that neighbour failing.
       */
      reach44: (() => {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = 21;
        // North, south, east and west at 22px out. Not the corners: a 44px circle is a
        // perfectly good 44px target and does not reach the corners of a 44px square.
        const pts = [[cx, cy-d], [cx, cy+d], [cx-d, cy], [cx+d, cy]];
        return pts.every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit && (hit === el || el.contains(hit));
        });
      })(),
    });
  }
  return out;
});

/** Every piece of rendered text, with the size it actually renders at. */
const typeSweep = () => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({
      text: own.slice(0, 32),
      cls: (el.className.baseVal ?? el.className ?? '').toString().split(' ')[0],
      size: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    });
  }
  return out;
});

/**
 * What a short phone cannot see.
 *
 * EVERY RENDER THIS PROJECT HAS EVER TAKEN WAS 844 PIXELS TALL, and that is not a small
 * detail — it is the reason the same class of bug has now shipped three times. `position:
 * fixed` escaping the phone frame was invisible at 390 wide. The listening screen's
 * `height: 300px` plate and `margin-top: 312px` title were invisible at 844 tall, and on
 * an iPhone SE they put the entire transport under the tab bar and both action buttons
 * below the glass. That was reported by a person, twice, as "the play controls are cut
 * off", and every screenshot taken to check it was the wrong height to show it.
 *
 * So each screen is now also measured at 375x667, which is the iPhone SE and the shortest
 * phone anybody is realistically holding. A control that leaves the frame or hides under
 * the tab bar at that height is reported with its screen and its name.
 *
 * It measures the SAME app in the SAME state — one `setViewportSize` and back — rather
 * than walking the whole product twice, because the failure is a layout that does not
 * respond to height and one resize is enough to expose it.
 */
const SHORT = { width: 375, height: 667 };
const TALL = { width: 390, height: 844 };
const fitSweep = async () => {
  await p.setViewportSize(SHORT);
  // Long enough for a clamp() on dvh to settle and for any transition to land.
  await p.waitForTimeout(260);
  const out = await p.evaluate(() => {
    const screen = document.querySelector('.screen');
    if (!screen) return [];
    const box = screen.getBoundingClientRect();
    /*
     * THE TAB BAR DOES NOT ALWAYS WIN, and assuming it did made this audit lie.
     *
     * The floor used to be the top of the nav whenever a nav was showing, on the fair
     * reasoning that under the tab bar is as lost as off the bottom. It is not always
     * under it: the package screen is z-index 60 against the nav's 50, so its primary
     * button is drawn OVER the bar, perfectly visible and perfectly tappable — and was
     * reported as "52px past the frame or under the tab bar" on every short-phone run.
     * A false positive in an audit is worse than a gap, because it teaches you to skim
     * the output and the next one will be real.
     *
     * So the frame is the only floor, and whether the bar actually covers anything is a
     * question asked of the composed page below, per control, by hit-testing.
     */
    const navEl = document.querySelector('.nav');
    const navTop = navEl && navEl.getBoundingClientRect().height > 0
      ? navEl.getBoundingClientRect().top : Infinity;
    const floor = box.bottom;
    const out = [];
    for (const el of document.querySelectorAll('button,[role="button"],[role="slider"],a,input,select')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
      // A control inside something that scrolls is not lost, it is below the fold. Only
      // a control the listener has no way to reach counts.
      let scrolls = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowY;
        if (o === 'auto' || o === 'scroll') { scrolls = true; break; }
      }
      if (scrolls) continue;
      // The tab bar's own buttons are inside the tab bar, so measuring them against the
      // top of the tab bar reports every one of them forever. The bar is the floor.
      if (el.closest('.nav')) continue;
      /*
       * A map pin off the bottom of the map is a pin somebody pans to, not a control
       * that fell out of a column. The whole point of this check is layouts that do not
       * respond to height, and an SVG scene graph is not one.
       */
      if (el.closest('svg.map')) continue;
      /*
       * And a control UNDER a full-screen overlay is not lost either — it is behind the
       * listening screen, where it belongs. Without this the sheet's narrator, its
       * segmented control and every map fab were reported on the listening screen, none
       * of which a person can see, let alone miss.
       *
       * A point inside the element that is also inside the viewport: if nothing is there,
       * the control really is off the glass, which is the failure. If something else is,
       * it is covered.
       */
      const px = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
      const py = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
      const inView = py >= r.top - 1 && py <= r.bottom + 1;
      if (inView) {
        const hit = document.elementFromPoint(px, py);
        if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
      }
      /*
       * Does the tab bar REALLY cover this one? Asked at the control's own bottom edge
       * rather than assumed from its coordinates, because a control can legitimately be
       * drawn over the bar.
       */
      let buried = false;
      if (r.bottom > navTop + 1) {
        const by = Math.min(Math.max(r.bottom - 3, 1), window.innerHeight - 1);
        const hit = document.elementFromPoint(px, by);
        buried = !hit || !(hit === el || el.contains(hit) || hit.contains(el));
      }
      const lost = buried || r.bottom > floor + 1 || r.top < box.top - 1
        || r.right > box.right + 1 || r.left < box.left - 1;
      if (!lost) continue;
      out.push({
        name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        cls: (el.className.baseVal ?? el.className ?? '').toString().split(' ')[0],
        by: Math.round(Math.max(
          buried ? r.bottom - navTop : 0,
          r.bottom - floor, box.top - r.top, r.right - box.right, box.left - r.left)),
      });
    }
    return out;
  });
  await p.setViewportSize(TALL);
  await p.waitForTimeout(260);
  return out;
};

const screens = {};
const type = {};
const fits = {};
const capture = async (label) => {
  screens[label] = await inventory();
  type[label] = await typeSweep();
  fits[label] = await fitSweep();
};

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
        /*
          A ring is an outline with width, or a shadow standing in for one. Either is
          visible; neither is not.

          AN ANCESTOR'S RING COUNTS, which this used to miss and report as a failure. A
          native <select> inside a labelled row is the case: the ring belongs on the row,
          because the row is the thing a person sees and the select inside it is a 15px
          strip of text. The question WCAG 2.4.7 asks is whether focus is visible, not
          which element the outline is painted on, so this walks up until it finds one or
          leaves the interactive control's own box.
        */
        ring: (() => {
          for (let n = el; n && n !== document.body; n = n.parentElement) {
            const s = getComputedStyle(n);
            if ((parseFloat(s.outlineWidth) || 0) > 0 && s.outlineStyle !== 'none') return true;
            // Only a wrapper that is drawn as one control counts, not the whole page.
            if (n !== el && !n.className.toString().length) return false;
          }
          return false;
        })(),
        /*
          A shadow only counts if focus is what PUT IT THERE.

          `boxShadow !== 'none'` was the test, and it excused every control with a
          permanent glow — which on this app is the aqua play button, the one control most
          likely to be operated from a keyboard. Blurring and re-reading is the only way to
          ask the question honestly: the element is measured focused, blurred, measured
          again, and focus is restored so the walk carries on from the same place.
        */
        shadow: (() => {
          const lit = cs.boxShadow;
          el.blur();
          const dark = getComputedStyle(el).boxShadow;
          el.focus();
          return lit !== 'none' && lit !== dark;
        })(),
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
// Measuring before the webfont lands measures the fallback.
await p.evaluate(() => document.fonts.ready);
await capture('onboarding/welcome');
// Walk the onboarding, capturing every step.
for (let i=0;i<9 && await p.locator('.onb').count();i++){
  const start = p.getByRole('button',{name:/Start looking/});
  const allow = p.getByRole('button',{name:/Allow location/});
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
  if (await p.locator('.onb').count()) await capture('onboarding/step' + (i+1));
}
await p.waitForTimeout(4500);
/*
 * Walking opens on the rose, which is its own screen and worth inventorying. The map is
 * one tap behind it.
 */
await capture('walk/rose');
focus.push(...await focusSweep('walk/rose'));
/*
 * THE SHEET IS GONE, and so are the four steps that used to be here.
 *
 * This walked the sheet: raise it to half, click a row, click a plate to play, then drag
 * through full and peek and both of the sheet's tabs. There is one bar now (`EchoBar`),
 * the transcript is on the player and saved is under My Echoes, so the walk is the walk a
 * person actually takes — step the arrows, open the card, play from it.
 */
await p.getByLabel(/^Show me the map|the street map/).click().catch(()=>{});
await p.waitForTimeout(800);
await capture('map');
focus.push(...await focusSweep('map'));
await p.locator('.echobar-arrow').last().click(); await p.waitForTimeout(700);
await capture('map/stepped');
await p.locator('.echobar-tap').click(); await p.waitForTimeout(600);
await capture('map/card');
focus.push(...await focusSweep('map/card'));
/*
 * Playing an echo opens the listening screen, which is a screen in its own right and gets
 * inventoried like one. Without this step the audit's next click landed on the listening
 * screen instead of the map and the whole walk timed out, which is the audit doing its
 * job: a screen appeared that it had never been told about.
 */
const play = p.locator('.pop-go');
if (await play.count()) { await play.click(); await p.waitForTimeout(2200); }
else { await p.locator('.pop-close').click(); await p.waitForTimeout(400);
       await p.locator('.echobar-orb').click(); await p.waitForTimeout(2200); }
await capture('listening');
focus.push(...await focusSweep('listening'));
await p.getByRole('button', { name: /Read it/ }).click().catch(()=>{}); await p.waitForTimeout(500);
await capture('listening/reading');
await p.getByRole('button', { name: /Hide it/ }).click().catch(()=>{}); await p.waitForTimeout(400);
await p.getByLabel('Back to the map').click().catch(()=>{}); await p.waitForTimeout(600);
await capture('map/playing');
focus.push(...await focusSweep('map/playing'));
/*
 * The category row is inline on foot and driving (`JourneyChip`), so it is already in the
 * map captures. On a flight it is still folded behind one button, which is opened here.
 */
if (await p.locator('.catfilter-tap').count()) {
  await p.locator('.catfilter-tap').click(); await p.waitForTimeout(400);
  await capture('map/filter');
  focus.push(...await focusSweep('map/filter'));
  await p.locator('.catfilter-tap').click(); await p.waitForTimeout(300);
}
/* The trip sheet: Walk / Drive / Fly and the routes for each, one tap on the journey chip. */
await p.getByLabel(/Change your journey|Your journey, on this device/).click().catch(()=>{});
await p.waitForTimeout(400);
await capture('map/trip');
focus.push(...await focusSweep('map/trip'));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.locator('.nav button').nth(1).click(); await p.waitForTimeout(700); await capture('my-echoes');
focus.push(...await focusSweep('my-echoes'));
/*
 * Settings is no longer a tab. It is a gear on My Echoes, so the audit walks the route a
 * person actually walks. Worth noting why this line changed rather than just changing it:
 * moving settings behind that gear made it unreachable for anybody with an empty
 * collection, because Collection returns early before the header renders. The header is
 * on the empty branch now, and this is the walk that proves it.
 */
await p.locator('.coll-settings').click(); await p.waitForTimeout(700); await capture('settings');
focus.push(...await focusSweep('settings'));
await p.locator('.nav button').first().click(); await p.waitForTimeout(600);
/* The package is reached through the journey chip now: the download fab that used to
   open it was a duplicate of that chip and is gone. */
await p.getByLabel(/Change your journey|Your journey, on this device/).click().catch(()=>{});
await p.waitForTimeout(300);
await p.getByRole('button', { name: /Journey details|Find a flight by airport/ }).click().catch(()=>{});
await p.waitForTimeout(700); await capture('package');

const all = Object.entries(screens);
const seen = new Map();
for (const [screen, items] of all) for (const it of items) {
  const key = it.name + '|' + it.cls;
  if (!seen.has(key)) seen.set(key, { ...it, screen });
}
console.log(`=== ${seen.size} distinct controls across ${all.length} screens ===\n`);
const fail = { unnamed: [], small: [], thumb: [], tooltip: [], mute: [] };
for (const [, it] of seen) {
  if (!it.name) fail.unnamed.push(it);
  if (it.w < 24 || it.h < 24) fail.small.push(it);
  else if (!it.reach44) fail.thumb.push(it);
  if (it.title) fail.tooltip.push(it);
  if (it.looksOn && !it.saysState) fail.mute.push(it);
}
const show = (label, list) => console.log(`${label}: ${list.length ? list.map(i=>`${i.cls} "${i.name}" ${i.w}x${i.h} (${i.screen})`).join('\n    ') : 'none'}`);
show('WITHOUT ACCESSIBLE NAME', fail.unnamed);
show('UNDER 24x24 (WCAG 2.5.8)', fail.small);
console.log(`\nADVISORY, a 44px thumb misses these (${fail.thumb.length}). Filter chips at 40 in a
48px row, and map pins that overlap when echoes are close, are deliberate. Everything
here clears the 24x24 legal floor. Listed so the decision stays visible:
    ${fail.thumb.map(i => `${i.cls} "${i.name.slice(0, 30)}" ${i.w}x${i.h}`).join('\n    ') || 'none'}\n`);

// Type, deduplicated by class and size so one offending rule is reported once.
const tiny = new Map();
for (const [screen, items] of Object.entries(type)) for (const t of items) {
  if (t.size >= 11) continue;
  const key = t.cls + '|' + t.size;
  if (!tiny.has(key)) tiny.set(key, { ...t, screen });
}
console.log(`UNDER 11px (Apple's floor, and this is read outdoors): ${tiny.size
  ? [...tiny.values()].sort((a, b) => a.size - b.size)
      .map(t => `${t.size}px  .${t.cls} "${t.text}" (${t.screen})`).join('\n    ')
  : 'none'}`);
show('NATIVE TOOLTIP', fail.tooltip);
show('SELECTED BUT SILENT (WCAG 4.1.2)', fail.mute);

const ringless = new Map();
for (const stop of focus) if (!stop.ring && !stop.shadow) ringless.set(stop.cls + '|' + stop.name, stop);
console.log(`NO FOCUS RING (WCAG 2.4.7, ${focus.length} tab stops): ` + (ringless.size
  ? [...ringless.values()].map(i => `${i.tag}.${i.cls} "${i.name}" (${i.screen})`).join('\n    ')
  : 'none'));

/*
 * The short-screen report. Deduplicated by control, because one unresponsive layout shows
 * up on every screen that uses it and the interesting number is how many CONTROLS are
 * unreachable, not how many screens.
 */
const lost = new Map();
for (const [screen, items] of Object.entries(fits)) for (const it of items) {
  const key = it.cls + '|' + it.name;
  if (!lost.has(key)) lost.set(key, { ...it, screen });
}
console.log(`\nOFF A SHORT PHONE (${SHORT.width}x${SHORT.height}, an iPhone SE): ` + (lost.size
  ? [...lost.values()].map(i => `.${i.cls} "${i.name}" is ${i.by}px past the frame or under the tab bar (${i.screen})`).join('\n    ')
  : 'none'));

console.log('\nPAGE ERRORS:', errors.length ? [...new Set(errors)].join('\n  ') : 'none');
await b.close();
shutdown();
