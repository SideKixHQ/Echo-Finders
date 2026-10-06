/**
 * Is anything covering anything, and can you actually read it.
 *
 * The controls audit answers whether each control is named, big enough and focusable. It
 * cannot answer the two questions that a phone screen fails at hardest, because both need
 * the COMPOSED page rather than a list of elements:
 *
 *   OCCLUDED      the control is on screen, the right size, correctly labelled, and
 *                 something is drawn on top of its middle. Every check in the other audit
 *                 passes and the thing does not work. This is the defect that cost the
 *                 most rounds in this project's history: a map pin that could not be
 *                 tapped because the SVG captured the pointer, a cluster hidden behind a
 *                 filter chip, a fan pin behind the zoom buttons, the only way back from
 *                 walk mode under a card. Every one of them was found by rendering and
 *                 hit-testing, and none of them by reading code.
 *
 *   UNREADABLE    the text's colour against the colour ACTUALLY BEHIND IT. The contrast
 *                 script reads the stylesheet and checks the pairs somebody thought to
 *                 declare; it cannot see that a label sits over the basemap rather than
 *                 over the panel it was designed for, or that three stacked translucent
 *                 surfaces compose to something paler than any of them. This walks the
 *                 ancestor chain, blends every semi-transparent background on the way, and
 *                 measures what a person is looking at.
 *
 * It also reports two cheaper things that only exist once boxes are real: text clipped by
 * its own container, and interactive elements whose boxes overlap without one containing
 * the other, which is how two things end up fighting for the same thumb.
 *
 *   node scripts/audit-layout.mjs
 *
 * Run at 375x667 as well as 390x844. An iPhone SE is the screen this app has failed on
 * every single time, and it is still a phone people are walking around with.
 */

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4188;
spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
const shutdown = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
process.on('exit', shutdown);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}

/* A stand-in basemap, because this sandbox cannot reach Esri and a transparent tile would
   make every contrast reading over the map optimistic. Grey, like the real one. */
const tile = (bg, fg) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${bg}"/><path d="M0 64H256M0 128H256M64 0V256M128 0V256" stroke="${fg}" stroke-width="2" fill="none"/></svg>`);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/**
 * The page's own answer to "what is covering what, and what can be read".
 *
 * Every measurement is taken inside the browser against the composed page. Nothing here
 * is derived from the stylesheet, which is the entire point.
 */
const PROBE = () => {
  const px = (n) => Math.round(n);
  const screen = document.querySelector('.screen');
  const frame = screen ? screen.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };

  const parseRgb = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, c) => {
    const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  /**
   * What is actually behind this element.
   *
   * Walks up compositing every background it meets, so three stacked translucent panels
   * give the colour they compose to rather than the colour of the nearest one. Stops at
   * the first fully opaque surface. Falls back to the page background, which is the honest
   * answer for anything floating over the map.
   *
   * STARTS AT THE ELEMENT, not its parent. The first version started one level up and
   * reported every primary button in the app as 1.24:1: those carry their own aqua
   * gradient, so the ink is dark on purpose, and skipping the element's own background
   * measured that ink against the page behind the button.
   *
   * Returns null for a gradient or an image, rather than a wrong number. A ratio against
   * one colour of a gradient is a guess dressed as a measurement, and a false failure in
   * an audit is worse than a gap in one: it teaches you to skim the output.
   */
  const behind = (el) => {
    let acc = null;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parseRgb(cs.backgroundColor);
      if (!bg || bg.a === 0) continue;
      acc = acc === null ? bg : over(acc, bg);
      if (acc.a >= 0.999) return acc;
    }
    const page = parseRgb(getComputedStyle(document.body).backgroundColor) ?? { r: 11, g: 15, b: 43, a: 1 };
    return acc === null ? page : over(acc, page);
  };

  const label = (el) => {
    const n = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return n.slice(0, 40);
  };
  const cls = (el) => ((el.className.baseVal ?? el.className ?? '').toString().split(' ')[0]) || el.tagName.toLowerCase();
  /*
   * Visible, ANCESTORS INCLUDED.
   *
   * The control column is faded and made unclickable by a rule on `.rail`, not on each
   * fab, so reading the fab's own opacity said 1 and the audit reported five buttons
   * fighting a card that had already stood them down. Anything hidden by something above
   * it is hidden.
   */
  const shown = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (Number(cs.opacity) < 0.08) return false;
      if (cs.pointerEvents === 'none' && n !== el) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /*
   * THE LAYER THAT HAS THE SCREEN.
   *
   * Onboarding, the sync moment, the player and the viewfinder are full screens drawn over
   * the map, and the map is still mounted underneath with every pin and fab in it. Probing
   * all of them reported forty covered controls that are covered ON PURPOSE, which buries
   * the handful that are not.
   *
   * So: find the topmost thing that covers most of the frame, and if there is one, judge
   * only what is inside it. An overlay that covers the screen IS the screen.
   */
  /*
   * SCROLLED OUT IS NOT COVERED.
   *
   * A settings row eighty pixels below the end of a scrolling panel, or a Save button
   * below the fold inside the echo card, is at a screen coordinate that belongs to
   * something else — so `elementFromPoint` dutifully names the tab bar or the card's own
   * kicker as the thing "covering" it. Fourteen of the first run's findings were this.
   * Anything clipped by an ancestor that scrolls is a scroll position, not a defect.
   */
  const visibleInScrollers = (el) => {
    const r = el.getBoundingClientRect();
    const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/auto|scroll|hidden/.test(cs.overflowY + cs.overflowX)) continue;
      const b = n.getBoundingClientRect();
      if (cy < b.top - 1 || cy > b.bottom + 1 || cx < b.left - 1 || cx > b.right + 1) return false;
    }
    return true;
  };

  /*
   * Layers that are MEANT to cover the map.
   *
   * The echo card, the sync moment, the player, onboarding, the package screen. A pin
   * under the card you opened by tapping that pin is the product working. Reporting it
   * every run is how a person learns to stop reading the report.
   */
  const LAYER = ['pop', 'synced', 'hear', 'vf', 'onb', 'pf', 'plan', 'city', 'paywall', 'walk', 'rose', 'nowhere', 'catpop', 'chipwrap', 'chips', 'fan-backdrop'];
  const inLayer = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = (n.className.baseVal ?? n.className ?? '').toString();
      if (LAYER.some((k) => new RegExp(`(^|\\s)${k}(\\s|-|$)`).test(c))) return true;
    }
    return false;
  };

  const frameArea = (frame.right - frame.left) * (frame.bottom - frame.top);
  const topLayer = (() => {
    let best = null;
    for (const el of document.querySelectorAll('div,section,main,form')) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < frameArea * 0.6) continue;
      if (el.classList.contains('screen') || el.classList.contains('phone') || el.classList.contains('stage')) continue;
      best = el;
    }
    return best;
  })();
  const inPlay = (el) => topLayer === null || topLayer.contains(el) || el.contains(topLayer);

  /*
   * CLIPPED IS NOT COVERED EITHER.
   *
   * The map clips its own contents to the band between the map bar and the tab bar, so a
   * pin whose coordinates land under the bar is drawn to nothing — and the map already
   * answers for it with an edge marker pointing off screen. `elementFromPoint` at its
   * centre dutifully names the bar as the thing on top. Reading the clip rectangle out of
   * the document is ordinary SVG semantics rather than knowledge of this app.
   */
  const clipBand = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const ref = /url\(["']?#([^"')]+)/.exec(getComputedStyle(n).clipPath || '');
      if (!ref) continue;
      const rect = document.getElementById(ref[1])?.querySelector('rect');
      if (!rect) continue;
      const owner = n.ownerSVGElement ?? n.closest('svg');
      if (!owner) continue;
      const o = owner.getBoundingClientRect();
      const sx = o.width / (owner.viewBox?.baseVal?.width || o.width || 1);
      const sy = o.height / (owner.viewBox?.baseVal?.height || o.height || 1);
      return {
        top: o.top + Number(rect.getAttribute('y') || 0) * sy,
        bottom: o.top + (Number(rect.getAttribute('y') || 0) + Number(rect.getAttribute('height') || 0)) * sy,
        left: o.left + Number(rect.getAttribute('x') || 0) * sx,
        right: o.left + (Number(rect.getAttribute('x') || 0) + Number(rect.getAttribute('width') || 0)) * sx,
      };
    }
    return null;
  };
  const insideClip = (el) => {
    const band = clipBand(el);
    if (!band) return true;
    const r = el.getBoundingClientRect();
    const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
    return cy >= band.top && cy <= band.bottom && cx >= band.left && cx <= band.right;
  };

  const occluded = [];
  /** Map marks under something, which is where the echoes happen to be. Listed, not failed. */
  const geography = [];
  const collide = [];
  const clipped = [];
  const faint = [];

  const controls = [...document.querySelectorAll('button,[role="button"],[role="slider"],a,input,select,textarea')]
    .filter(shown)
    .filter(inPlay)
    .filter(visibleInScrollers)
    .filter(insideClip)
    .filter((el) => !el.hasAttribute('disabled'));

  /* ── occlusion ────────────────────────────────────────────────────────────
     The centre, and only the centre. An edge that clips under a neighbour is
     usually fine and often deliberate; a middle that belongs to something else
     means the control cannot be pressed. */
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < frame.left || cx > frame.right || cy < frame.top || cy > frame.bottom) continue;
    /*
     * Scrolled off, not covered. A chip whose middle has run past the end of a horizontal
     * scroller is partly out of view, and what is at its centre is whatever sits beyond the
     * scroller — the "more" arrow, here. The arrow, or a swipe, is how it is reached; that
     * is the scroller working rather than a control lying on top of another.
     */
    let scroller = el.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
    if (scroller) {
      const s = scroller.getBoundingClientRect();
      if (cx < s.left || cx > s.right) continue;
    }
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) continue;
    if (hit === el || el.contains(hit) || hit.contains(el)) continue;
    /* Covered by a layer that exists to cover things is the product, not a defect. */
    if (inLayer(hit) && !inLayer(el)) continue;
    /*
     * A MARK IS AT A PLACE, and that is not a layout defect.
     *
     * A pin or a cluster dot sits at a coordinate on the ground; it cannot be nudged out
     * from under the control column without lying about where the echo is. Two of them
     * overlapping each other is the same fact. Both are already answered elsewhere — the
     * map pans, the column's gaps let taps through, and the bar's two arrows reach every
     * echo on the map without aiming at anything.
     *
     * So these are listed and not failed, exactly as the controls audit lists the targets
     * a 44px thumb misses. Anything else covering a control IS a defect: nothing else on
     * this screen has a reason to be where it is.
     */
    const mark = (c) => c === 'pin' || c === 'clus';
    const row = { cls: cls(el), name: label(el), by: cls(hit), byName: label(hit), at: [px(cx), px(cy)] };
    (mark(row.cls) ? geography : occluded).push(row);
  }

  /* ── two controls sharing pixels ─────────────────────────────────────────
     Only where neither contains the other, and only when the shared area is a
     real fraction of the smaller one. Two buttons in a row touching at their
     borders is not a defect. */
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], c = controls[j];
      if (a.contains(c) || c.contains(a)) continue;
      /* One of them belongs to a layer drawn over the other. That is the layer working. */
      if (inLayer(a) !== inLayer(c)) continue;
      const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
      const w = Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left);
      const h = Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top);
      if (w <= 2 || h <= 2) continue;
      const area = w * h;
      const smaller = Math.min(ra.width * ra.height, rc.width * rc.height);
      if (area < smaller * 0.25) continue;
      const row = { a: cls(a), aName: label(a), b: cls(c), bName: label(c), by: px(Math.min(w, h)) };
      const mark = (x) => x === 'pin' || x === 'clus';
      (mark(row.a) || mark(row.b) ? geography : collide).push(row);
    }
  }

  /* ── text its own box cannot hold ─────────────────────────────────────────
     `overflow: hidden` with no ellipsis is a sentence cut in half. Ellipsis is
     a deliberate truncation and is left alone. */
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,p,span,strong,small,b,em,button,label,li')) {
    if (!shown(el) || !inPlay(el) || !visibleInScrollers(el)) continue;
    if (el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'visible' && cs.overflowY === 'visible') continue;
    if (cs.textOverflow === 'ellipsis') continue;
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;
    if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
      clipped.push({ cls: cls(el), text: (el.textContent ?? '').trim().slice(0, 40),
        by: px(Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth)) });
    }
  }

  /* ── contrast, against what is really there ──────────────────────────────
     1.4.3 asks 4.5:1, or 3:1 for text at 18.66px+ or bold 14px+. */
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,p,span,strong,small,b,em,button,label,li,a,td,th')) {
    if (!shown(el)) continue;
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    if ([...el.children].some((c) => (c.textContent ?? '').trim())) continue;
    const cs = getComputedStyle(el);
    if (!inPlay(el)) continue;
    const fg = parseRgb(cs.color);
    if (!fg) continue;
    const bg = behind(el);
    if (bg === null) continue;
    const composed = fg.a < 1 ? over(fg, bg) : fg;
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 18.66 || (size >= 14 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(composed, bg);
    if (got + 0.02 < need) {
      faint.push({ cls: cls(el), text: text.slice(0, 32), got: Math.round(got * 100) / 100, need,
        size: Math.round(size * 10) / 10, fg: cs.color, bg: `rgb(${px(bg.r)},${px(bg.g)},${px(bg.b)})` });
    }
  }

  return { occluded, geography, collide, clipped, faint };
};

const findings = { occluded: new Map(), geography: new Map(), collide: new Map(), clipped: new Map(), faint: new Map() };
const errors = [];

const record = (screenName, result) => {
  for (const it of result.occluded) findings.occluded.set(`${it.cls}|${it.name}|${it.by}`, { ...it, screen: screenName });
  for (const it of result.geography) {
    const key = it.cls ? `${it.cls}|${it.name}|${it.by}` : `${it.a}|${it.b}`;
    findings.geography.set(key, { ...it, screen: screenName });
  }
  for (const it of result.collide) findings.collide.set(`${it.a}|${it.b}`, { ...it, screen: screenName });
  for (const it of result.clipped) findings.clipped.set(`${it.cls}|${it.text}`, { ...it, screen: screenName });
  for (const it of result.faint) findings.faint.set(`${it.cls}|${it.text}|${it.fg}`, { ...it, screen: screenName });
};

/** Walk the product once, at one size, in one theme. */
async function walk(width, height, theme) {
  const ctx = await b.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'],
    geolocation: { latitude: 40.7033, longitude: -74.0170 },
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  await p.route('**://server.arcgisonline.com/**', (r) => r.fulfill({
    contentType: 'image/svg+xml',
    body: r.request().url().includes('Light') ? tile('#e8eaee', '#cfd4dc') : tile('#262b34', '#343b47'),
  }));
  await p.goto(`http://127.0.0.1:${PORT}/`);
  await p.evaluate(() => document.fonts.ready);
  const tag = `${width}x${height}/${theme}`;
  const look = async (name) => record(`${name} (${tag})`, await p.evaluate(PROBE));

  /* Onboarding is a screen too, and the one every single person sees. */
  for (let i = 0; i < 9 && (await p.locator('.onb').count()); i++) {
    await look(`onboarding${i + 1}`);
    const start = p.getByRole('button', { name: /Start looking/ });
    const allow = p.getByRole('button', { name: /Allow location/ });
    if (await start.count()) await start.click();
    else if (await allow.count()) { await allow.click(); await p.waitForTimeout(1500); }
    else {
      const all = p.locator('.onb-all');
      if (await all.count() && await all.isEnabled()) { await all.click(); await p.waitForTimeout(200); }
      await p.locator('.onb-go').first().click();
    }
    await p.waitForTimeout(400);
  }
  await p.waitForTimeout(4500);

  /*
   * The theme switch lives on settings, so it is thrown here rather than by poking the
   * DOM: setting `data-theme` by hand gets overwritten by the app's own effect on the
   * next render, which quietly measures the dark theme and calls it light.
   */
  if (theme === 'light') {
    await p.locator('.nav button').nth(1).click(); await p.waitForTimeout(500);
    await p.locator('.coll-settings').click().catch(() => {}); await p.waitForTimeout(500);
    /*
     * The switch is a `role="switch"` called "Dark map", not a button called "Light".
     *
     * The first version looked for a button called "Light", found nothing, swallowed the
     * error with a `.catch()` and ran the entire light pass in the dark theme — three
     * screens' worth of readings labelled light that were nothing of the kind. A silent
     * miss in an audit is worse than no audit, so this asserts the theme actually changed
     * instead of hoping.
     */
    await p.getByRole('switch', { name: /Dark map/ }).first().click();
    await p.waitForTimeout(500);
    const got = await p.evaluate(() => document.documentElement.dataset.theme);
    if (got !== 'light') throw new Error(`light pass never reached the light theme (data-theme=${got})`);
    await look('settings');
    await p.locator('.nav button').first().click(); await p.waitForTimeout(700);
  }

  await look('walk/rose');
  await p.getByLabel(/^Show me the map|the street map/).click({ force: true }).catch(() => {});
  await p.waitForTimeout(900);
  await look('map');

  await p.locator('.catfilter-tap').click({ force: true }).catch(() => {});
  await p.waitForTimeout(400); await look('map/filter');
  await p.locator('.catfilter-tap').click({ force: true }).catch(() => {});
  await p.waitForTimeout(300);

  await p.locator('.echobar-arrow').last().click({ force: true }).catch(() => {});
  await p.waitForTimeout(800); await look('map/stepped');

  await p.locator('.echobar-tap').click({ force: true }).catch(() => {});
  await p.waitForTimeout(700); await look('map/card');

  const play = p.locator('.pop-go');
  if (await play.count()) { await play.click({ force: true }); await p.waitForTimeout(2200); }
  else {
    await p.locator('.pop-close').click({ force: true }).catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('.echobar-orb').click({ force: true }).catch(() => {});
    await p.waitForTimeout(2200);
  }
  await look('listening');
  await p.getByRole('button', { name: /Read it/ }).click({ force: true }).catch(() => {});
  await p.waitForTimeout(500); await look('listening/reading');
  await p.getByRole('button', { name: /Hide it/ }).click({ force: true }).catch(() => {});
  await p.waitForTimeout(300);
  await p.getByLabel('Back to the map').click({ force: true }).catch(() => {});
  await p.waitForTimeout(700); await look('map/playing');

  await p.locator('.nav button').nth(1).click(); await p.waitForTimeout(700);
  await look('my-echoes');
  await p.locator('.coll-settings').click().catch(() => {}); await p.waitForTimeout(600);
  await look('settings');
  await p.locator('.nav button').first().click(); await p.waitForTimeout(600);
  /* Through the journey chip, since the duplicate download fab is gone. */
  await p.getByLabel(/Change your journey|Your journey, on this device/).click({ force: true }).catch(() => {});
  await p.waitForTimeout(400); await look('trip-sheet');
  await p.getByRole('button', { name: /Journey details|Find a flight by airport/ }).click({ force: true }).catch(() => {});
  await p.waitForTimeout(800); await look('package');

  await ctx.close();
}

await walk(375, 667, 'dark');
await walk(390, 844, 'dark');
await walk(390, 844, 'light');

const show = (head, list, fmt) => {
  const rows = [...list.values()];
  console.log(`\n${head} (${rows.length})`);
  console.log(rows.length ? '    ' + rows.map(fmt).join('\n    ') : '    none');
  return rows.length;
};

console.log('\n=== layout, as the browser composes it ===');
const a = show('COVERED AT ITS OWN CENTRE — cannot be pressed', findings.occluded,
  (i) => `.${i.cls} "${i.name}" is under .${i.by} "${i.byName}" at ${i.at} (${i.screen})`);
const c = show('TWO CONTROLS SHARING PIXELS', findings.collide,
  (i) => `.${i.a} "${i.aName}" over .${i.b} "${i.bName}" by ${i.by}px (${i.screen})`);
show(`ADVISORY, map marks under something. A pin is at a place and cannot be moved off
the control column without lying about where the echo is; the column's gaps pass taps
through, the map pans, and the bar's arrows reach every echo without aiming. Listed so the
decision stays visible rather than quietly rotting into an excuse:`, findings.geography,
  (i) => (i.cls
    ? `.${i.cls} "${i.name}" under .${i.by} "${i.byName}" (${i.screen})`
    : `.${i.a} "${i.aName}" over .${i.b} "${i.bName}" by ${i.by}px (${i.screen})`));
const d = show('TEXT ITS OWN BOX CANNOT HOLD', findings.clipped,
  (i) => `.${i.cls} "${i.text}" clipped by ${i.by}px (${i.screen})`);
const e = show('BELOW 1.4.3, AGAINST WHAT IS ACTUALLY BEHIND IT', findings.faint,
  (i) => `.${i.cls} "${i.text}" ${i.got}:1 needs ${i.need}:1 — ${i.fg} on ${i.bg}, ${i.size}px (${i.screen})`);

console.log('\nPAGE ERRORS:', errors.length ? [...new Set(errors)].join('\n  ') : 'none');
await b.close();
shutdown();
process.exit(a + c + d + e > 0 ? 1 : 0);
