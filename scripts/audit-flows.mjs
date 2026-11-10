#!/usr/bin/env node
/**
 * Every way in has a way out: the app's main journeys, tapped through in the built app.
 *
 *   npm run audit:flows
 *
 * Written after James got stuck: My Echoes had a sliders icon (which reads as FILTER)
 * that opened Settings, and Settings had no title, no back button and no tab lit. Every
 * other audit measured how screens look; none of them pressed a button and checked where
 * it went or whether there was a way back. This one does, for each journey:
 *
 *   - the screen you land on says what it is (a visible title, or its own landmark)
 *   - the tab bar shows where you are
 *   - the way back is visible and takes you back
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4178;
const CASTLE = { latitude: 40.70331, longitude: -74.01705 };
const START = { latitude: 40.70556, longitude: -74.01705 };

spawnSync('npm', ['run', 'build', '-w', '@echofinders/prototype'], { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'ignore', detached: true, cwd: 'apps/prototype' });
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});
const failures = [];
const errors = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures.push(name);
};

async function freshApp() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation: START,
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  // The lock screen's buttons, recorded as the app registers them, so they can be pressed.
  await ctx.addInitScript(() => {
    window.__lock = {};
    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = ms.setActionHandler.bind(ms);
    ms.setActionHandler = (action, fn) => { window.__lock[action] = fn; set(action, fn); };
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  // First run is one screen: Find echoes near me asks for the location and opens the map.
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  // "How echoes unlock" follows the first run, once (Toasts.tsx): read it, then Got it.
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(2000);
  await p.waitForTimeout(600);
  return { ctx, p };
}

const visible = async (loc) => (await loc.count()) > 0 && await loc.first().isVisible();
const title = (p, text) => p.locator('h1:visible', { hasText: text });
const currentTab = (p) => p.locator('.nav [aria-current="page"]').textContent().catch(() => '');

// ── The three tabs ──────────────────────────────────────────────────────────────
{
  const { ctx, p } = await freshApp();
  const nav = p.locator('.nav');
  await nav.getByRole('button', { name: /My echoes/i }).click();
  await p.waitForTimeout(500);
  check('My Echoes: titled', await visible(title(p, 'My Echoes')));
  // The demo walk ran behind onboarding and saved Castle Clinton, so a new listener's
  // collection opened with a fort they had never walked to.
  check('My Echoes: nothing found before a single step', (await p.locator('.entry').count()) === 0);
  check('My Echoes: its tab is lit', /My Echoes/i.test(await currentTab(p)));
  check('My Echoes: no settings button pretending to be a filter',
    (await p.locator('.screen-body').getByRole('button', { name: 'Settings' }).count()) === 0);

  await nav.getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(500);
  check('Settings: a tab of its own', await visible(title(p, 'Settings')));
  check('Settings: its tab is lit', /Settings/i.test(await currentTab(p)));
  await nav.getByRole('button', { name: /My echoes/i }).click();
  await p.waitForTimeout(400);
  check('Settings: My Echoes tab leads out', await visible(title(p, 'My Echoes')));
  await nav.getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(400);
  await nav.getByRole('button', { name: /Map/ }).click();
  await p.waitForTimeout(600);
  check('Settings: Map tab leads to the map', await visible(p.locator('.mapbar')));
  check('Map: its tab is lit', /Map/i.test(await currentTab(p)));

  // Kinds of echo: one button that says what is on, every kind behind it at once.
  const kinds = p.locator('.kind-tap');
  check('Kinds: the button says everything is on', (await kinds.innerText()).trim() === "All echoes");
  await kinds.click();
  await p.waitForTimeout(400);
  const sheet = p.locator('#kind-box');
  // All, and nine kinds: Inspo joined the row on 2026-11-06 (`categories.tsx`, CHIP_GROUPS).
  check('Kinds: tapping it shows all of them at once, just below', (await sheet.locator('.chip').count()) === 10);
  await sheet.getByRole('button', { name: 'Ghosts' }).click();
  await p.waitForTimeout(300);
  check('Kinds: picking keeps it open, to pick more', await visible(sheet));
  await p.mouse.click(195, 400);
  await p.waitForTimeout(300);
  check('Kinds: a tap on the map closes it', !(await visible(sheet)));
  check('Kinds: the button says what is picked', /Ghosts/.test(await kinds.innerText()));
  await kinds.click();
  await p.waitForTimeout(300);
  await sheet.getByRole('button', { name: 'All' }).click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  check('Kinds: Escape closes it, and All puts everything back',
    !(await visible(sheet)) && (await kinds.innerText()).trim() === "All echoes");
  await ctx.close();
}

// ── Settings › Membership ──────────────────────────────────────────────────────
// Buying, cancelling and turning renewal back on, all from Settings. Nothing is charged:
// purchases are recorded on the device until Stripe lands.
{
  const { ctx, p } = await freshApp();
  await p.locator('.nav').getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(400);
  const panel = p.locator('.membership');
  check('Membership: first in Settings, and says the plan', /Free/.test(await panel.locator('.membership-plan').textContent() ?? ''));
  await panel.getByRole('button', { name: /Restore purchases/ }).click();
  await p.waitForTimeout(300);
  check('Membership: Restore says what it found', /Nothing to restore/.test(await panel.getByRole('status').textContent() ?? ''));
  await panel.getByRole('button', { name: /Membership options/ }).click();
  await p.waitForTimeout(400);
  const sheet = p.getByRole('dialog', { name: 'Membership options' });
  check('Membership: options open the plans', await visible(sheet));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await p.waitForTimeout(300);
  check('Membership: Close closes them', !(await visible(sheet)));
  await panel.getByRole('button', { name: /Membership options/ }).click();
  await p.waitForTimeout(400);
  await sheet.locator('label', { hasText: 'All-Access' }).click();
  await sheet.getByRole('button', { name: /Start All-Access/ }).click();
  await p.waitForTimeout(400);
  check('Membership: buying All-Access shows it, renewing', /All-Access[\s\S]*Renews/.test(await panel.locator('.membership-plan').textContent() ?? ''));
  await panel.getByRole('button', { name: /Cancel All-Access/ }).click();
  await p.waitForTimeout(300);
  await panel.getByRole('button', { name: 'Keep All-Access' }).click();
  await p.waitForTimeout(300);
  check('Membership: Keep All-Access backs out of cancelling', /Renews/.test(await panel.locator('.membership-plan').textContent() ?? ''));
  await panel.getByRole('button', { name: /Cancel All-Access/ }).click();
  await p.waitForTimeout(300);
  await panel.getByRole('button', { name: 'Cancel renewal' }).click();
  await p.waitForTimeout(300);
  check('Membership: cancelling keeps the year and stops the renewal', /All-Access[\s\S]*will not renew/.test(await panel.locator('.membership-plan').textContent() ?? ''));
  await panel.getByRole('button', { name: /Turn renewal back on/ }).click();
  await p.waitForTimeout(300);
  check('Membership: renewal turns back on', /Renews/.test(await panel.locator('.membership-plan').textContent() ?? ''));
  await ctx.close();
}

// ── Show me where they are, with no location ────────────────────────────────────
// Location refused: "Show me where they are" puts the echoes on the map (the city heatmap
// it used to open is gone, ADR-0018 amended 2026-11-10), and the tab bar has to leave it.
// The heatmap once changed the tab underneath and stayed on top, so every tab looked dead
// (James, 2026-11-09).
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: [],
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  // First run is one screen: Find echoes near me asks for the location and opens the map.
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  // "How echoes unlock" follows the first run, once (Toasts.tsx): read it, then Got it.
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const showAll = p.getByRole('button', { name: /Show me where they are/ });
  check('Show me where they are: offered with no location', await visible(showAll));
  await showAll.click().catch(() => {});
  await p.waitForTimeout(1500);
  const pins = p.locator('.pin, .clus');
  check('Show me where they are: the echoes, on the map', !(await visible(p.locator('.nowhere'))) && (await pins.count()) > 0
    && await visible(p.locator('.rail').getByRole('button', { name: 'Go to my location' })));
  check('Show me where they are: no heatmap screen', (await p.locator('.city').count()) === 0
    && (await p.getByRole('button', { name: 'Where the echoes are' }).count()) === 0);
  await p.locator('.nav').getByRole('button', { name: /Settings/ }).click();
  await p.waitForTimeout(600);
  check('Show me where they are: Settings in the tab bar leaves it', /Settings/i.test(await currentTab(p)) && await visible(p.locator('.panel.feedback').first()));
  await ctx.close();
}

// ── First run ───────────────────────────────────────────────────────────────────
// One screen (James, 2026-11-10): the echo, one line, Find echoes near me, a search box
// and the free line. Both ways in have to land on the map, and the search one has to land
// on the place searched for.
{
  const fresh = async (geo) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      ignoreHTTPSErrors: true, ...(geo ? { permissions: ['geolocation'], geolocation: START } : { permissions: [] }),
    });
    await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
    const p = await ctx.newPage();
    p.setDefaultTimeout(6000);
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    return { ctx, p };
  };
  {
    const { ctx, p } = await fresh(true);
    const onb = p.locator('.onb');
    check('First run: says what it is', await visible(onb.getByRole('heading', { name: 'Hear what happened here.' })));
    check('First run: the free line is shown', await visible(onb.getByText('Your first ten echoes are free.')));
    check('First run: a search box', await visible(onb.getByLabel('Search a city or ZIP code')));
    check('First run: one screen, nothing to step through',
      (await onb.getByRole('button').count()) === 1 && (await onb.getByText(/Get started|Skip|Continue/).count()) === 0);
    await onb.getByRole('button', { name: 'Find echoes near me' }).click();
    await onb.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    // "How echoes unlock" follows the first run, once (Toasts.tsx): read it, then Got it.
    await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(1500);
    check('First run: Find echoes near me opens the map', !(await onb.count()) && await visible(p.locator('.nav')));
    check('First run: and uses the location it asked for', !(await visible(p.getByText('Where are you?'))));
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    check('First run: only once', !(await p.locator('.onb').count()));
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh(false);
    const box = p.getByLabel('Search a city or ZIP code');
    await box.fill('Wilmington');
    await p.waitForTimeout(400);
    const hit = p.locator('.fr-hit').first();
    check('First run: search finds a city', await visible(hit) && /Wilmington/.test(await hit.innerText()));
    await hit.click();
    await p.locator('.onb').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    // "How echoes unlock" follows the first run, once (Toasts.tsx): read it, then Got it.
    await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(1500);
    check('First run: search opens the map there',
      !(await p.locator('.onb').count()) && /Wilmington/.test(await p.getByLabel(/Change your journey/).innerText().catch(() => '')));
    await ctx.close();
  }
}

// ── A shared link ───────────────────────────────────────────────────────────────
// `?echo=<id>`, from the card's Share. Somebody new, with no location and no pass, should
// come out of onboarding looking at that story's place with its card open and a Play
// button on it (James, 2026-11-09).
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: [],
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/?echo=wilmington-the-first-curtain`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  // First run is one screen: Find echoes near me asks for the location and opens the map.
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  // "How echoes unlock" follows the first run, once (Toasts.tsx): read it, then Got it.
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const card = p.locator('.pop');
  check('Shared link: opens the story\'s card', await visible(card) && /The First Curtain/.test(await card.innerText()));
  check('Shared link: takes the id off the address', !new URL(p.url()).searchParams.has('echo'));
  check('Shared link: Play, though nobody is there', await visible(card.getByRole('button', { name: 'Play', exact: true })));
  await ctx.close();
}

// ── Go to my location ───────────────────────────────────────────────────────────
// "Back to me" was a pill that showed only after a search and, far from any echo, went to a
// screen with no map on it (James, 2026-11-10: "doesnt really work anyway"). Its job is the
// locate arrow's now: it must exist on the map, light up while following, go plain after a
// drag, and on a tap put you back in the middle of the map, including from another city.
{
  const { ctx, p } = await freshApp();
  for (let i = 0; i < 3; i++) await p.locator('.synced-later').click({ timeout: 800 }).catch(() => {});
  check('Locate: no "Back to me" pill on the map', (await p.getByText('Back to me').count()) === 0);
  const locate = p.getByRole('button', { name: 'Go to my location' });
  check('Locate: the arrow is on the map controls', await visible(p.locator('.rail').getByRole('button', { name: 'Go to my location' })));
  const size = await locate.boundingBox();
  check('Locate: a 44px target', !!size && size.width >= 44 && size.height >= 44, JSON.stringify(size));
  check('Locate: lit while the map follows you', (await locate.getAttribute('aria-pressed')) === 'true');
  // Where "you" sits on screen while following, to compare with after the tap.
  const here = async () => {
    const b = await p.locator('.here').first().boundingBox().catch(() => null);
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  };
  const home = await here();
  const map = await p.locator('.map-canvas').boundingBox();
  const cx = map.x + map.width / 2, cy = map.y + map.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.mouse.move(cx - 140, cy - 160, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  check('Locate: plain once the map is dragged away', (await locate.getAttribute('aria-pressed')) === 'false');
  await locate.click();
  await p.waitForTimeout(1200);
  const back = await here();
  check('Locate: a tap follows you again', (await locate.getAttribute('aria-pressed')) === 'true');
  check('Locate: a tap puts you back where you were on screen',
    !!home && !!back && Math.hypot(home.x - back.x, home.y - back.y) < 40, `${JSON.stringify(home)} -> ${JSON.stringify(back)}`);
  // From somewhere looked up, a tap comes all the way home.
  await p.getByLabel('Search a city, place or ZIP code').fill('Wilmington');
  await p.waitForTimeout(600);
  await p.locator('.msearch-city').first().click();
  await p.waitForTimeout(1500);
  check('Locate: plain while looking somewhere else', (await locate.getAttribute('aria-pressed')) === 'false');
  await locate.click();
  await p.waitForTimeout(1500);
  const fromAway = await here();
  check('Locate: from another city, back to you', (await locate.getAttribute('aria-pressed')) === 'true'
    && !!fromAway && !!home && Math.hypot(home.x - fromAway.x, home.y - fromAway.y) < 40, JSON.stringify(fromAway));
  await ctx.close();
}

// ── The map's two controls, and where the other four went ───────────────────────
// The approved map board draws two round controls: Show where I am and Sound. The column
// had six, two of them meaning "around me", and it covered pins (ADR-0018, amended
// 2026-11-10). Each of the four that left has to be reachable from where it went.
{
  const { ctx, p } = await freshApp();
  for (let i = 0; i < 3; i++) await p.locator('.synced-later').click({ timeout: 800 }).catch(() => {});
  const names = await p.locator('.rail button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  check('Two controls: locate and sound, on foot', names.join(' | ') === 'Go to my location | Mute the sonar', names.join(' | '));
  const sizes = await p.locator('.rail button').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
  check('Two controls: each at least 44px', sizes.length === 2 && sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(sizes));
  for (const gone of ['Listen for echoes', 'Where the echoes are', 'Back to what is around you', 'Show the street map', 'Echoes around me']) {
    check(`Two controls: "${gone}" is off the map`, (await p.locator('.rail').getByRole('button', { name: gone }).count()) === 0);
  }
  // Sound mutes and comes back, remembered as before.
  const sound = p.locator('.rail').getByRole('button', { name: 'Mute the sonar' });
  await sound.click();
  await p.waitForTimeout(300);
  const muted = p.locator('.rail').getByRole('button', { name: 'Turn the sonar on' });
  check('Sound: a tap mutes it', await visible(muted) && (await muted.getAttribute('aria-pressed')) === 'false');
  check('Sound: remembered', (await p.evaluate(() => localStorage.getItem('echo-finders:sonar'))) === 'off');
  await muted.click();
  await p.waitForTimeout(300);
  check('Sound: a second tap turns it back on', (await p.locator('.rail').getByRole('button', { name: 'Mute the sonar' }).getAttribute('aria-pressed')) === 'true');
  // The compass view, and the street hum on it, from the trip sheet; and its own way back.
  const chip = p.getByLabel(/Change your journey/);
  await chip.click();
  await p.waitForTimeout(400);
  const compass = p.locator('.jmenu').getByRole('button', { name: /Compass view/ });
  check('Compass view: a card in the trip sheet on foot', await visible(compass));
  await compass.click();
  await p.waitForTimeout(900);
  check('Compass view: opens the compass', await visible(p.locator('.rose')));
  check('Compass view: Listen for echoes is on it',
    await visible(p.locator('.rose').getByRole('button', { name: /Listen for echoes|Use the compass/ })));
  check('Compass view: Sound is still to hand', await visible(p.locator('.rail').getByRole('button', { name: /sonar/ })));
  await p.locator('.rose').getByRole('button', { name: 'Show the map' }).click();
  await p.waitForTimeout(900);
  check('Compass view: Show the map comes back', !(await visible(p.locator('.rose')))
    && await visible(p.locator('.rail').getByRole('button', { name: 'Go to my location' })));
  // Exploring, there is no framing card: a pinch out shows the clusters and the area card.
  await chip.click();
  await p.waitForTimeout(400);
  check('Whole route: not offered while exploring', (await p.locator('.jmenu').getByRole('button', { name: /Whole (journey|route)/ }).count()) === 0);
  // On a flight, the whole journey is a card in the trip sheet, and the arrow comes back.
  await p.locator('.jmenu').getByRole('button', { name: 'Fly', exact: true }).click();
  await p.waitForTimeout(300);
  await p.locator('.jmenu .jmenu-routes .jmenu-item').first().click();
  await p.waitForTimeout(1500);
  const flying = await p.locator('.rail button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  check('Two controls: on a flight, only the locate arrow', flying.join(' | ') === 'Go to my location', flying.join(' | '));
  await p.locator('.journey-tap, .jchip').first().click();
  await p.waitForTimeout(400);
  const whole = p.locator('.jmenu').getByRole('button', { name: /Whole journey/ });
  check('Whole journey: a card in the trip sheet on a route', await visible(whole));
  await whole.click();
  await p.waitForTimeout(1200);
  const locate = p.locator('.rail').getByRole('button', { name: 'Go to my location' });
  check('Whole journey: frames the route, and the arrow goes plain', (await locate.getAttribute('aria-pressed')) === 'false');
  await p.locator('.journey-tap, .jchip').first().click();
  await p.waitForTimeout(400);
  check('Whole journey: ticked while it is showing',
    (await p.locator('.jmenu').getByRole('button', { name: /Whole journey/ }).getAttribute('aria-current')) === 'true');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await locate.click();
  await p.waitForTimeout(1200);
  check('Whole journey: the arrow comes back to you', (await locate.getAttribute('aria-pressed')) === 'true');
  await ctx.close();
}

// ── Take me there: directions inside the app ────────────────────────────────────
// James (2026-11-10): "take me there should take you there not open another window you
// have to tap to open another app." One tap on the card starts the walk here: the turn at
// the top, the walk at the bottom, a way to end it, and nothing that leaves the app.
{
  const { ctx, p } = await freshApp();
  const opened = [];
  ctx.on('page', (pg) => opened.push(pg.url()));
  await p.addStyleTag({ content: '.synced { pointer-events: none !important; }' });
  let take = null;
  for (let i = 0; i < 10 && !take; i++) {
    await p.locator('.synced-later').click({ timeout: 500 }).catch(() => {});
    await p.locator('.echobar-tap').click().catch(() => {});
    await p.waitForTimeout(500);
    const b = p.locator('.pop').getByRole('button', { name: /Take me there|Walk there/ });
    if (await b.count()) take = b;
    else {
      await p.keyboard.press('Escape');
      await p.locator('.echobar-arrow').last().click().catch(() => {});
      await p.waitForTimeout(300);
    }
  }
  check('Directions: an echo card offers to take you there', !!take);
  if (take) {
    await take.click();
    await p.waitForTimeout(2500);
    check('Directions: one tap, and the turn is on screen', await visible(p.locator('.dir-turn')));
    const turn = (await p.locator('.dir-turn').innerText().catch(() => '')).trim();
    check('Directions: the turn says how far and what to do', /\d+(\.\d)? k?m/.test(turn) && /(Turn|Carry on|Continue|Straight|Head|Almost)/.test(turn), turn);
    const sheet = p.locator('.dir-sheet');
    check('Directions: the sheet says how long, when and where to', await visible(sheet)
      && /min|km/.test(await sheet.innerText()) && /to /.test(await sheet.innerText()), await sheet.innerText().catch(() => ''));
    check('Directions: says what happens on arrival', await visible(sheet.getByText('When you arrive it unlocks. Tap Play.', { exact: false })));
    check('Directions: the way is drawn on the map', (await p.locator('.dir-line').count()) === 1);
    check('Directions: nothing hands off to another maps app',
      (await p.locator('a[href*="maps.apple.com"], a[href*="google.com/maps"]').count()) === 0 && opened.length === 0, opened.join(' '));
    const end = sheet.getByRole('button', { name: 'End directions' });
    const box = await end.boundingBox();
    check('Directions: End directions is a 44px target', !!box && box.height >= 44, JSON.stringify(box));
    await end.click();
    await p.waitForTimeout(600);
    check('Directions: End directions ends them', !(await p.locator('.dir-turn, .dir-sheet, .dir-line').count()));
  }
  await ctx.close();
}

// ── The echo card, before you are there ─────────────────────────────────────────
// The approved card (2026-11): one primary that says what is true, a gold line saying why
// there is no Play yet, and four round buttons with their names under them. The smaller
// things (other maps app, report, suggest) are under More.
{
  const { ctx, p } = await freshApp();
  await p.locator('.echobar-tap').click().catch(() => {});
  await p.waitForTimeout(600);
  const card = p.locator('.pop');
  check('Echo card: opens from the bar', await visible(card));
  // A bottom sheet (the Card board, 2026-11-10): on the tab bar, clear of the map bar, and
  // the whole card on screen at once, the four round buttons included, with no scrolling.
  const sheet = await card.evaluate((c) => {
    const box = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    const r = c.getBoundingClientRect();
    const acts = box('.pop-acts');
    return { top: r.top, bottom: r.bottom, scroll: c.scrollHeight - c.clientHeight,
      mapbar: box('.mapbar')?.bottom ?? null, nav: box('.nav')?.top ?? null,
      acts: acts && { top: acts.top, bottom: acts.bottom }, handle: !!c.querySelector('.pop-handle') };
  });
  check('Echo card: a sheet on the tab bar, with a handle',
    sheet.nav !== null && Math.abs(sheet.bottom - sheet.nav) <= 1 && sheet.handle, JSON.stringify(sheet));
  check('Echo card: clear of the map bar', sheet.mapbar !== null && sheet.top >= sheet.mapbar, JSON.stringify(sheet));
  check('Echo card: the buttons are on screen without scrolling', sheet.scroll <= 1 && !!sheet.acts
    && sheet.acts.top >= sheet.top && sheet.acts.bottom <= sheet.bottom + 1, JSON.stringify(sheet));
  const walk = card.getByRole('button', { name: /^Walk there · \d+ min$/ });
  check('Echo card: far off, the primary is Walk there with the minutes', await visible(walk));
  // The first locked card ever carries the longer tip (how echoes unlock, how close this
  // one needs you) with Got it; after that the gold line is the short one.
  const tipOk = card.locator('.pop-tip-ok');
  if (await tipOk.count()) {
    check('Echo card: the first locked card says how echoes unlock, and how close',
      await visible(card.getByText(/Echoes unlock where they happened\. Walk within \d+ m/)));
    await tipOk.click();
    await p.waitForTimeout(300);
    check('Echo card: Got it leaves the short line', (await card.locator('.pop-tip-ok').count()) === 0);
  }
  check('Echo card: far off, says why there is no Play', await visible(card.getByText('Unlocks when you get there')));
  check('Echo card: far off, no Play', (await card.locator('.pop-go').count()) === 0);
  for (const name of ['Save', 'Add to route', 'Share', 'More']) {
    check(`Echo card: ${name}, with its name under it`, await visible(card.getByRole('button', { name, exact: true })));
  }
  const small = await card.locator('.pop-act, .pop-aim, .pop-close').evaluateAll((els) => els
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map((e) => e.textContent.trim() || e.getAttribute('aria-label')));
  check('Echo card: every control at least 44px', small.length === 0, small.join(', '));
  const oneLine = await card.locator('.pop-act').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  check('Echo card: the labels stay on one line', oneLine);
  await card.getByRole('button', { name: 'Save', exact: true }).click().catch(() => {});
  await p.waitForTimeout(300);
  check('Echo card: Save saves', await visible(card.getByRole('button', { name: 'Saved', exact: true })));
  await card.getByRole('button', { name: 'More', exact: true }).click().catch(() => {});
  await p.waitForTimeout(300);
  const menu = card.getByRole('menu');
  check('Echo card: More opens a menu', await visible(menu) && (await menu.getByRole('menuitem').count()) > 0);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  check('Echo card: Escape shuts the menu and leaves the card', !(await visible(menu)) && await visible(card));
  // The ways out of the sheet besides the ✕ (checked with the synced story below): Escape,
  // and dragging the handle down. Each reopens the card from the bar for the next.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  check('Echo card: Escape closes it', !(await visible(card)));
  await p.locator('.echobar-tap').click().catch(() => {});
  await p.waitForTimeout(600);
  const grip = await card.locator('.pop-handle').boundingBox().catch(() => null);
  if (grip) {
    await p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await p.mouse.down();
    await p.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 160, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(500);
  }
  check('Echo card: dragging the handle down closes it', !!grip && !(await visible(card)), JSON.stringify(grip));
  await p.locator('.echobar-tap').click().catch(() => {});
  await p.waitForTimeout(600);
  await walk.click().catch(() => {});
  await p.waitForTimeout(800);
  check('Echo card: Walk there starts the way there',
    !(await visible(card)) || (await walk.getAttribute('aria-pressed').catch(() => null)) === 'true');
  await ctx.close();
}

// ── The echo card, too far to walk ──────────────────────────────────────────────
// Searching Boston from Wilmington offered "Walk there", and the walk it started said
// "1,083 km · Head northeast · Too far to walk". Past a walk (`going.ts`), the card says how
// far plainly, Save is the primary, and nothing offers directions. The bar beside it says
// "1 min listen", not "0:59", which read as the time it takes to get there.
{
  const { ctx, p } = await freshApp();
  const box = p.getByLabel('Search a city, place or ZIP code');
  await box.click();
  await box.fill('Boston');
  await p.waitForTimeout(600);
  await p.locator('#msearch-results .msearch-go').first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const card = p.locator('.pop');
  check('Far card: Go on a Boston echo opens its card', await visible(card));
  await card.locator('.pop-tip-ok').click({ timeout: 1000 }).catch(() => {});
  await p.waitForTimeout(300);
  const far = (await card.locator('.pop-far').innerText().catch(() => '')).trim();
  check('Far card: says how far, plainly', /^[\d,]+ km away$/.test(far), far);
  check('Far card: no directions offered',
    (await card.getByRole('button', { name: /Walk there|Ride there|Take me there|Following/ }).count()) === 0
    && (await card.locator('.pop-aim:not(.pop-keep)').count()) === 0);
  const keep = card.locator('.pop-primary').getByRole('button', { name: 'Save', exact: true });
  check('Far card: Save is the primary', await visible(keep));
  check('Far card: Save is not on the card twice', (await card.getByRole('button', { name: 'Save', exact: true }).count()) === 1);
  check('Far card: the gold line says it unlocks when you are there', await visible(card.getByText("Unlocks when you're there")));
  const keepBox = await keep.boundingBox();
  check('Far card: Save is a 44px target', !!keepBox && keepBox.height >= 44, JSON.stringify(keepBox));
  await keep.click().catch(() => {});
  await p.waitForTimeout(300);
  check('Far card: Save saves', await visible(card.locator('.pop-primary').getByRole('button', { name: 'Saved', exact: true })));
  check('Far card: nothing walks you there', !(await p.locator('.dir-turn, .dir-sheet').count()));
  const facts = (await p.locator('.echobar-facts').first().innerText().catch(() => '')).trim();
  check('Echo bar: the length says it is a listen, not a clock', /min listen$/.test(facts) && !/\d:\d\d/.test(facts), facts);
  await ctx.close();
}

// ── Saved, in My Echoes ─────────────────────────────────────────────────────────
// Save said "Saved" on the card and in the search, and My Echoes said "Nothing synced yet":
// saved echoes were only on it when they were on the current journey. Now every saved echo
// is under Saved, with Go (its card on the map) and Unsave, and saving says where it went.
{
  const { ctx, p } = await freshApp();
  const nav = p.locator('.nav');
  const big = (loc) => loc.evaluateAll((els) => els
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map((e) => e.textContent.trim() || e.getAttribute('aria-label')));

  // Empty, it says what to do next, and the routes' empty state is a heading and a line.
  await nav.getByRole('button', { name: /My echoes/i }).click();
  await p.waitForTimeout(500);
  const find = p.locator('.screen-body').getByRole('button', { name: 'Find echoes near me' });
  check('My Echoes empty: a next step, Find echoes near me', await visible(find));
  check('My Echoes empty: the next step is a 44px target', (await big(find)).length === 0);
  await p.getByRole('tab', { name: 'Routes' }).click();
  await p.waitForTimeout(400);
  const gap = await p.locator('.routes-empty').evaluate((e) => {
    const b = e.querySelector('b').getBoundingClientRect(), t = e.querySelector('span').getBoundingClientRect();
    return t.top - b.bottom;
  }).catch(() => -1);
  check('Routes empty: "No routes yet" sits on its own line, apart from the words under it', gap >= 0, String(gap));
  await p.getByRole('tab', { name: 'Echoes' }).click();
  await p.waitForTimeout(300);
  await find.click();
  await p.waitForTimeout(800);
  check('My Echoes empty: Find echoes near me goes to the map', await visible(p.locator('.mapbar')) && /Map/i.test(await currentTab(p)));

  // Save on the card says where it went.
  await p.locator('.echobar-tap').click().catch(() => {});
  await p.waitForTimeout(600);
  const card = p.locator('.pop');
  await card.locator('.pop-tip-ok').click({ timeout: 1000 }).catch(() => {});
  const near = (await card.locator('h3').innerText().catch(() => '')).trim();
  await card.locator('.pop-acts').getByRole('button', { name: 'Save', exact: true }).click().catch(() => {});
  await p.waitForTimeout(400);
  check('Saved: the card says Saved to My echoes', await visible(p.locator('.toast-saved', { hasText: 'Saved to My echoes' })));
  await p.locator('.pop-close').click().catch(() => {});
  await p.waitForTimeout(300);

  // So does Save in the search, on the row, because the results cover the toast.
  const box = p.getByLabel('Search a city, place or ZIP code');
  await box.click();
  await box.fill('Boston');
  await p.waitForTimeout(600);
  const row = p.locator('#msearch-results .msearch-echo').first();
  const far = (await row.locator('b').innerText().catch(() => '')).trim();
  await row.locator('.msearch-save').click().catch(() => {});
  await p.waitForTimeout(300);
  check('Saved: the search row says Saved to My echoes', await visible(row.getByText('Saved to My echoes')));
  await p.getByRole('button', { name: 'Close search' }).click().catch(() => {});
  await p.waitForTimeout(300);

  // My Echoes lists both, the one near and the one a city away.
  await nav.getByRole('button', { name: /My echoes/i }).click();
  await p.waitForTimeout(600);
  const saved = p.locator('section[aria-label="Saved"]');
  check('Saved: My Echoes has a Saved section', await visible(saved.getByRole('heading', { name: /^Saved · 2$/ })));
  check('Saved: both are listed, the near one and the far one', !!near && !!far
    && await visible(saved.locator('.entry-wish', { hasText: near })) && await visible(saved.locator('.entry-wish', { hasText: far })), `${near} / ${far}`);
  check('Saved: no Nothing synced yet over a list that has something in it', (await p.getByText('Nothing synced yet').count()) === 0);
  check('Saved: each has Go and Unsave', (await saved.locator('.entry-wish').evaluateAll((rs) => rs.every((r) => r.querySelector('.saved-go') && r.querySelector('.saved-unsave')))));
  const smallSaved = await big(saved.locator('button'));
  check('Saved: Go and Unsave are 44px targets', smallSaved.length === 0, smallSaved.join(', '));
  // Saved keeps: a reload does not lose it (`saved-store.ts`).
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('.how-go').click({ timeout: 1500 }).catch(() => {});
  await nav.getByRole('button', { name: /My echoes/i }).click().catch(() => {});
  await p.waitForTimeout(600);
  check('Saved: a reload keeps what was saved', await visible(saved.getByRole('heading', { name: /^Saved · 2$/ }))
    && await visible(saved.locator('.entry-wish', { hasText: far })));
  await saved.getByRole('button', { name: `Unsave ${far}` }).click().catch(() => {});
  await p.waitForTimeout(300);
  check('Saved: Unsave takes it off', (await saved.locator('.entry-wish').count()) === 1 && !(await visible(saved.locator('.entry-wish', { hasText: far }))));
  await saved.getByRole('button', { name: `Go to ${near}` }).click().catch(() => {});
  await p.waitForTimeout(1200);
  check('Saved: Go opens its card on the map', /Map/i.test(await currentTab(p))
    && await visible(p.locator('.pop')) && (await p.locator('.pop h3').innerText().catch(() => '')).includes(near), near);
  await ctx.close();
}

// ── Search, on top of the map ──────────────────────────────────────────────────
// James (2026-11-10): "When someone is searching you have to make that box stand out ...
// it has to be really easy to search, then go or save an echo." The box is the map's first
// row, the trip and the echoes filter on one line under it; typing lists CITIES, then
// ECHOES with Go and Save on each.
{
  const { ctx, p } = await freshApp();
  const box = p.getByLabel('Search a city, place or ZIP code');
  check('Map search: the box is on the map, first', await visible(box)
    && await p.locator('.mapbar > :first-child').evaluate((e) => e.classList.contains('msearch')));
  check('Map search: says what to type', (await box.getAttribute('placeholder')) === 'Search a city or ZIP');
  const fx = await p.locator('.msearch .fr-trace').evaluate((e) => getComputedStyle(e).animationName);
  check('Map search: the box draws the eye (its border runs)', /fr-trace/.test(fx), fx);
  const row = await p.locator('.mapbar-row').evaluate((r) => {
    const kids = [...r.children].map((c) => c.getBoundingClientRect()).filter((b) => b.height > 0);
    const labels = [...r.querySelectorAll('.jchip-label, .kind-label')].every((e) => e.scrollWidth <= e.clientWidth + 1);
    return { oneLine: kids.every((b) => Math.abs(b.top - kids[0].top) < 2), labels, h: r.getBoundingClientRect().height };
  });
  check('Map search: the trip and the echoes filter sit on one line under it, words whole', row.oneLine && row.labels, JSON.stringify(row));
  check('Map search: the journey chip says how you are going', /Walking nearby/.test(await p.locator('.jchip').innerText()));
  check('Map search: the filter says All echoes', (await p.locator('.kind-tap').innerText()).trim() === 'All echoes');
  const under = await p.locator('.mapbar').boundingBox();
  const toastTop = await p.locator('.toast-dock').boundingBox().catch(() => null);
  check('Map search: toasts sit under the map bar, not over it', !toastTop || toastTop.y >= under.y + under.height, JSON.stringify({ under, toastTop }));
  await box.click();
  await box.fill('new');
  await p.waitForTimeout(500);
  const results = p.locator('#msearch-results');
  check('Map search: typing opens the results over the map', await visible(results));
  check('Map search: the results cover the tab bar', await p.evaluate(() => {
    const nav = document.querySelector('.nav').getBoundingClientRect();
    const top = document.elementFromPoint(nav.left + nav.width / 2, nav.top + nav.height / 2);
    return !!top && !!top.closest('.mapbar');
  }));
  check('Map search: CITIES, with New York', await visible(results.getByRole('heading', { name: 'Cities' }))
    && await visible(results.locator('.msearch-city', { hasText: 'New York' })));
  check('Map search: ECHOES, each with Go and Save', await visible(results.getByRole('heading', { name: 'Echoes' }))
    && (await results.locator('.msearch-echo').count()) > 0
    && (await results.locator('.msearch-echo').evaluateAll((rs) => rs.every((r) => r.querySelector('.msearch-go') && r.querySelector('.msearch-save')))));
  const small = await results.locator('button').evaluateAll((els) => els
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map((e) => e.textContent.trim() || e.getAttribute('aria-label')));
  check('Map search: every result control at least 44px', small.length === 0, small.join(', '));
  const save = results.locator('.msearch-save').first();
  await save.click();
  await p.waitForTimeout(300);
  check('Map search: Save saves', (await save.getAttribute('aria-pressed')) === 'true');
  await save.click();
  await p.waitForTimeout(300);
  check('Map search: Save again unsaves', (await save.getAttribute('aria-pressed')) === 'false');
  const title = (await results.locator('.msearch-echo b').first().innerText()).trim();
  await results.locator('.msearch-go').first().click();
  await p.waitForTimeout(1200);
  check('Map search: Go closes the results', !(await visible(results)));
  check('Map search: Go opens that echo\'s card', await visible(p.locator('.pop')) && (await p.locator('.pop').innerText()).includes(title), title);
  await p.locator('.pop-close').click().catch(() => {});
  await p.waitForTimeout(300);
  await box.click();
  await box.fill('ne');
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Close search' }).click();
  await p.waitForTimeout(300);
  {
    const after = { results: await visible(results), row: await visible(p.locator('.mapbar-row')), value: await box.inputValue(),
      card: await visible(p.locator('.pop')), focused: await p.evaluate(() => document.activeElement?.className ?? '') };
    check('Map search: the ✕ puts the map back', !after.results && after.row && after.value === '', JSON.stringify(after));
  }
  await box.click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  check('Map search: Escape puts the map back', !(await visible(results)));
  await p.locator('.jchip').click();
  await p.waitForTimeout(300);
  check('Map search: no second search inside the trip sheet', (await p.locator('.jmenu input[type="search"]').count()) === 0);
  await ctx.close();
}

// ── The trip sheet ──────────────────────────────────────────────────────────────
// The trip board (2026-11-10): "Your trip" with a ✕, Walk / Drive / Fly, Around here
// (picked, ticked) and Plan a walk as cards, the guided walks near you by full name with
// how far, how long and how many echoes, and the other cities behind a link. It scrolls
// inside itself and never sits under the tab bar.
{
  const { ctx, p } = await freshApp();
  const chip = p.getByLabel(/Change your journey/);
  await chip.click();
  await p.waitForTimeout(400);
  const sheet = p.locator('.jmenu');
  check('Trip sheet: opens from the journey chip', await visible(p.getByRole('dialog', { name: 'Your trip' })));
  check('Trip sheet: titled Your trip', await visible(sheet.getByRole('heading', { name: 'Your trip' })));
  const modes = sheet.getByRole('group', { name: 'How are you travelling?' });
  check('Trip sheet: Walk / Drive / Fly', (await modes.getByRole('button').allInnerTexts()).map((t) => t.trim()).join(' ') === 'Walk Drive Fly');
  check('Trip sheet: on foot, Walk is picked', (await modes.getByRole('button', { name: 'Walk' }).getAttribute('aria-pressed')) === 'true');
  const around = sheet.locator('.jmenu-card', { hasText: 'Around here' });
  check('Trip sheet: Around here, picked and ticked', await visible(around)
    && (await around.getAttribute('aria-current')) === 'true' && (await around.locator('.jmenu-tick').count()) === 1);
  check('Trip sheet: Around here says what it does', /No route\. Echoes near you as you go\./.test(await around.innerText()));
  check('Trip sheet: Plan a walk, with a way in', await visible(sheet.locator('.jmenu-card', { hasText: 'Plan a walk' }).locator('.jmenu-chev')));
  check('Trip sheet: guided walks near you', await visible(sheet.getByText('Guided walks near you')));
  const walks = await sheet.locator('.jmenu-routes .jmenu-item').allInnerTexts();
  check('Trip sheet: each walk by its full name, how far, how long, how many echoes',
    walks.length > 0 && walks.every((t) => /:/.test(t) && /\d+(\.\d)? km · about \d+ (min|hr) · \d+ echoe?s?/.test(t)), walks.join(' / '));
  check('Trip sheet: tours in other cities, as a link with a count',
    /^Tours in other cities \(\d+\)$/.test((await sheet.locator('.jmenu-far').innerText().catch(() => '')).trim()));
  const small = await sheet.locator('button').evaluateAll((els) => els
    .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && (r.width < 44 || r.height < 44); })
    .map((e) => e.textContent.trim() || e.getAttribute('aria-label')));
  check('Trip sheet: every control at least 44px', small.length === 0, small.join(', '));
  const tiny = await sheet.evaluate((s) => [...s.querySelectorAll('*')]
    .filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent.trim()));
  check('Trip sheet: no text under 14px', tiny.length === 0, tiny.join(', '));
  // Every tour open, so there is more than fits: it scrolls inside itself, above the tabs.
  await sheet.locator('.jmenu-far').click().catch(() => {});
  await p.waitForTimeout(300);
  const fit = await p.evaluate(() => {
    const m = document.querySelector('.jmenu');
    const nav = document.querySelector('.nav').getBoundingClientRect();
    const r = m.getBoundingClientRect();
    return { bottom: r.bottom, navTop: nav.top, scrolls: getComputedStyle(m).overflowY === 'auto' && m.scrollHeight > m.clientHeight };
  });
  check('Trip sheet: never under the tab bar', fit.bottom <= fit.navTop, JSON.stringify(fit));
  check('Trip sheet: scrolls inside itself', fit.scrolls, JSON.stringify(fit));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await p.waitForTimeout(400);
  check('Trip sheet: the ✕ closes it', !(await visible(sheet)));
  await chip.click();
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  check('Trip sheet: Escape closes it', !(await visible(p.locator('.jmenu'))));
  check('Trip sheet: Escape hands focus back to the chip', await chip.evaluate((e) => e === document.activeElement));
  await chip.click();
  await p.waitForTimeout(400);
  const nav = await p.locator('.nav').boundingBox();
  await p.mouse.click(8, nav.y - 6);
  await p.waitForTimeout(400);
  check('Trip sheet: a tap on the dimmed map closes it', !(await visible(p.locator('.jmenu'))));
  await ctx.close();
}

// ── A story: its card, then the player ──────────────────────────────────────────
// The walk runs on real timers and a simulated GPS, so arriving is retried from a fresh
// start; only a journey that arrives and then has no way back is a failure.
async function arrive() {
  for (let tries = 0; tries < 5; tries++) {
    const { ctx, p } = await freshApp();
    // Walk in at a walking pace; a jump is rejected as implausible.
    for (let i = 0; i <= 10; i++) {
      await ctx.setGeolocation({ latitude: START.latitude + (CASTLE.latitude - START.latitude) * (i / 10), longitude: CASTLE.longitude });
      await p.waitForTimeout(500);
    }
    for (let i = 0; i < 70 && !(await p.locator('.toast-synced').count()); i++) {
      await ctx.setGeolocation({ ...CASTLE, latitude: CASTLE.latitude + (i % 2) * 0.00001 });
      await p.waitForTimeout(700);
    }
    if (await p.locator('.toast-synced').count()) return { ctx, p };
    await ctx.close();
  }
  return null;
}
{
  const arrived = await arrive();
  // The sync moment is a toast (`Toasts.tsx`, B): it syncs, then you tap Play.
  check('Arriving: the synced toast appears', arrived !== null);
  if (arrived) {
    const { ctx, p } = arrived;
    const toast = p.locator('.toast-synced');
    check('Synced toast: names the echo and says tap to play',
      /Synced · tap to play/.test(await toast.innerText()) && /Eight million/.test(await toast.innerText()));
    check('Synced toast: announced, inside a status region',
      (await p.locator('.toast-dock[role="status"] .toast-synced').count()) === 1);
    const box = await toast.boundingBox();
    const nav = await p.locator('.nav').boundingBox();
    check('Synced toast: clear of the tab bar', box !== null && nav !== null && box.y + box.height <= nav.y,
      JSON.stringify({ box, nav }));
    // Next, on its own row: the nearest echo still waiting, and how far a walk it is.
    const next = p.locator('.toast-synced .toast-act-next');
    check('Synced toast: offers Next with a walking time',
      /^Next · \d+ min walk/.test((await next.innerText().catch(() => '')).trim()));
    const nb = await next.boundingBox();
    check('Synced toast: Next is a 44px target', nb !== null && nb.height >= 44, JSON.stringify(nb));
    const close = p.locator('.toast-synced .toast-close');
    const cb = await close.boundingBox();
    check('Synced toast: the ✕ is a 44px target', cb !== null && cb.width >= 44 && cb.height >= 44, JSON.stringify(cb));
    await close.click().catch(() => {});
    await p.waitForTimeout(500);
    check('Synced toast: ✕ closes it', !(await visible(p.locator('.toast-synced'))));

    await p.getByRole('button', { name: /^Open: Eight million/ }).click().catch(() => {});
    await p.waitForTimeout(600);
    check('Story card: opens from the bar', await visible(p.locator('.pop')));
    await p.locator('.pop-close').click().catch(() => {});
    await p.waitForTimeout(400);
    check('Story card: ✕ closes it', !(await visible(p.locator('.pop'))));

    await p.getByRole('button', { name: /^Open: Eight million/ }).click().catch(() => {});
    await p.waitForTimeout(500);
    await p.locator('.pop-go').click().catch(() => {});
    await p.waitForTimeout(1200);
    check('Player: Play opens it', await visible(p.locator('.hear')));
    // The lock screen: the story's name, and Pause, Play and Stop that work.
    const lock = () => p.evaluate(() => ({
      title: navigator.mediaSession?.metadata?.title ?? null,
      state: navigator.mediaSession?.playbackState ?? null,
      actions: Object.keys(window.__lock).filter((a) => window.__lock[a]),
    }));
    const press = (a) => p.evaluate((a) => window.__lock[a]?.({ action: a }), a);
    const go = p.locator('.hear-go');
    let ls = await lock();
    check('Lock screen: names the story', /Eight million/.test(ls.title ?? ''), JSON.stringify(ls));
    check('Lock screen: offers pause, play and stop', ['pause', 'play', 'stop'].every((a) => ls.actions.includes(a)), ls.actions.join(','));
    await press('pause');
    await p.waitForTimeout(500);
    ls = await lock();
    check('Lock screen: Pause pauses the story', (await go.getAttribute('aria-label')) === 'Play' && ls.state === 'paused', JSON.stringify(ls));
    await press('play');
    await p.waitForTimeout(500);
    check('Lock screen: Play carries on', (await go.getAttribute('aria-label')) === 'Pause' && (await lock()).state === 'playing');
    await press('stop');
    await p.waitForTimeout(500);
    check('Lock screen: Stop stops it and lets the lock screen go', (await go.getAttribute('aria-label')) === 'Play' && (await lock()).title === null);
    await go.click();
    await p.waitForTimeout(800);

    const back = p.getByRole('button', { name: 'Back to the map' });
    check('Player: a visible way back', await visible(back));
    await back.click().catch(() => {});
    await p.waitForTimeout(600);
    check('Player: back returns to the map', !(await visible(p.locator('.hear'))) && await visible(p.locator('.mapbar')));

    // My Echoes now holds the fort (History), so its filter has something to filter.
    await p.locator('.nav').getByRole('button', { name: /My echoes/i }).click();
    await p.waitForTimeout(500);
    const filter = p.getByRole('button', { name: /^Filter my echoes/ });
    const fort = p.locator('.entry', { hasText: 'Eight million' });
    check('Filter: a filter button on My Echoes', await visible(filter));
    await filter.click();
    await p.waitForTimeout(400);
    // All, and nine kinds, Inspo included (`categories.tsx`, CHIP_GROUPS).
    check('Filter: shows every kind at once', (await p.locator('#coll-filter .chip').count()) === 10);
    await p.locator('#coll-filter').getByRole('button', { name: /Ghosts/ }).click();
    await p.waitForTimeout(400);
    check('Filter: a kind you have none of hides the rest and says so',
      !(await visible(fort)) && await visible(p.locator('.coll-nomatch')));
    check('Filter: the button shows a filter is on', /filtered/.test(await filter.getAttribute('aria-label') ?? ''));
    await p.getByRole('button', { name: 'Show all' }).click();
    await p.waitForTimeout(400);
    check('Filter: Show all brings everything back', await visible(fort));
    await p.locator('#coll-filter').getByRole('button', { name: /History/ }).click();
    await p.waitForTimeout(400);
    check("Filter: the fort's own kind shows it", await visible(fort));

    // Place and Travel: only what the collection holds, and each narrows to the fort.
    const placeGroup = p.getByRole('group', { name: 'Place' });
    const travelGroup = p.getByRole('group', { name: 'Travel' });
    check('Filter: Place offers New York', await visible(placeGroup.getByRole('button', { name: 'New York' })));
    await placeGroup.getByRole('button', { name: 'New York' }).click();
    await p.waitForTimeout(300);
    check('Filter: New York shows the fort', await visible(fort));
    check('Filter: Travel offers Walking', await visible(travelGroup.getByRole('button', { name: 'Walking' })));
    check('Filter: Travel offers no way you have not travelled',
      (await travelGroup.getByRole('button', { name: 'Flying' }).count()) === 0);
    await travelGroup.getByRole('button', { name: 'Walking' }).click();
    await p.waitForTimeout(300);
    check('Filter: Walking shows the fort', await visible(fort));

    // Another journey: what was found on the first stays in My Echoes.
    await p.locator('.nav').getByRole('button', { name: /Map/ }).click();
    await p.waitForTimeout(500);
    await p.getByLabel(/Change your journey/).click();
    // Miami Beach is another city from New York, so its walks sit behind the toggle.
    const others = p.getByRole('button', { name: /Tours in other cities/ });
    check('Trip sheet: tours in other cities are one tap away', await visible(others));
    await others.click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('.jmenu-item', { hasText: 'Ocean Drive' }).first().click();
    await p.waitForTimeout(1500);
    // A guided walk follows the phone now, so Ocean Drive syncs nothing from New York; a toast
    // left over from the fort is cleared, as the reload below does, before My Echoes.
    for (let i = 0; i < 4 && (await p.locator('.toast-synced').count()); i++) {
      await p.locator('.toast-synced .toast-close').click().catch(() => {});
      await p.waitForTimeout(400);
    }
    await p.locator('.nav').getByRole('button', { name: /My echoes/i }).click();
    await p.waitForTimeout(800);
    check('My Echoes: keeps what was found on other journeys', await visible(fort));

    // Come back another day to where the fort was found: it is history, not a new sync.
    await p.reload();
    // The reload reopens Ocean Drive, which follows the phone and syncs nothing here. Any
    // toast that does land is cleared first, however late.
    for (let i = 0; i < 16; i++) {
      if (await p.locator('.toast-synced').count()) await p.locator('.toast-synced .toast-close').click().catch(() => {});
      await p.waitForTimeout(500);
    }
    // A later toast must not block the taps; it is still counted below if it is the fort.
    await p.addStyleTag({ content: '.toast-dock .toast { pointer-events: none !important; }' });
    await p.getByLabel(/Change your journey/).click();
    await p.waitForTimeout(300);
    await p.locator('.jmenu-mode', { hasText: 'Walk' }).click();
    await p.locator('.jmenu-card', { hasText: 'Around here' }).first().click();
    await p.waitForTimeout(2500);
    check('Synced toast: going back to a journey does not replay an old find',
      !(await p.locator('.toast-synced', { hasText: 'Eight million' }).count()));
    await ctx.close();
  }
}

// ── Synced toast: Next opens the next echo's card, and starts no directions ──────
{
  const arrived = await arrive();
  if (arrived) {
    const { ctx, p } = arrived;
    const next = p.locator('.toast-synced .toast-act-next');
    const name = ((await next.getAttribute('aria-label')) ?? '').replace(/^Next[^:]*: /, '');
    await next.click().catch(() => {});
    await p.waitForTimeout(800);
    check('Synced toast: Next opens that echo\'s card',
      name.length > 0 && await visible(p.locator('.pop', { hasText: name.slice(0, 20) })), name);
    check('Synced toast: Next closes the toast', !(await p.locator('.toast-synced').count()));
    check('Synced toast: Next starts no directions', !(await visible(p.locator('.dirbar'))));
    await ctx.close();
  } else check('Synced toast: arrives again for Next', false);
}

// ── How echoes unlock, once, after first run ────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation: START,
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  check('How echoes unlock: shown after the first run',
    await visible(p.getByRole('dialog', { name: 'How echoes unlock' })));
  check('How echoes unlock: three steps', (await p.locator('.how-step').count()) === 3);
  await p.getByRole('button', { name: 'Got it' }).click().catch(() => {});
  await p.waitForTimeout(500);
  check('How echoes unlock: Got it closes it to the map',
    !(await visible(p.locator('.how'))) && await visible(p.locator('.nav')));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  check('How echoes unlock: only once', !(await p.locator('.how').count()));
  await ctx.close();
}

// ── An echo is close: within 150 m, once, and Show me opens it ──────────────────
// 120 m north of the fort: inside the toast's 150 m, outside the fort's own radius.
const NEAR = { latitude: 40.70439, longitude: CASTLE.longitude };
async function nearby() {
  for (let tries = 0; tries < 3; tries++) {
    const { ctx, p } = await freshApp();
    for (let i = 0; i <= 6; i++) {
      await ctx.setGeolocation({ latitude: START.latitude + (NEAR.latitude - START.latitude) * (i / 6), longitude: NEAR.longitude });
      await p.waitForTimeout(500);
    }
    for (let i = 0; i < 20 && !(await p.locator('.toast-near').count()); i++) {
      await ctx.setGeolocation({ ...NEAR, latitude: NEAR.latitude + (i % 2) * 0.00001 });
      await p.waitForTimeout(500);
    }
    if (await p.locator('.toast-near').count()) return { ctx, p };
    await ctx.close();
  }
  return null;
}
{
  const first = await nearby();
  check('Nearby toast: appears within 150 m', first !== null);
  if (first) {
    const { ctx, p } = first;
    check('Nearby toast: says how close', /An echo is close · \d+ m/.test(await p.locator('.toast-near').innerText()));
    check('Nearby toast: the pin glows', (await p.locator('g.pin-near').count()) > 0);
    // Slides away by itself after six seconds.
    await p.waitForTimeout(7000);
    check('Nearby toast: slides away after six seconds', !(await p.locator('.toast-near').count()));
    // Once per echo: still standing there, it does not come back.
    await p.waitForTimeout(2000);
    check('Nearby toast: once per echo', !(await p.locator('.toast-near').count()));
    await ctx.close();
  }
  const second = await nearby();
  if (second) {
    const { ctx, p } = second;
    await p.getByRole('button', { name: /^Show me/ }).click().catch(() => {});
    await p.waitForTimeout(800);
    check('Nearby toast: Show me opens the echo', await visible(p.locator('.pop', { hasText: 'Eight million' })));
    check('Nearby toast: and goes', !(await p.locator('.toast-near').count()));
    await ctx.close();
  } else check('Nearby toast: appears again on a fresh start', false);
}

// ── A guided walk follows you ───────────────────────────────────────────────────
// Guided walks ran on a simulated GPS: starting "Old Wilmington" at St. James put you at
// the river and synced its echo before a step was taken (found 2026-11-10). Starting one
// now leaves you where you are, syncs nothing out of reach, and shows the way to the
// first stop. Its own context, standing at St. James.
{
  const ST_JAMES = { latitude: 34.2357, longitude: -77.9452 };
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, permissions: ['geolocation'], geolocation: ST_JAMES,
  });
  await ctx.route('**://server.arcgisonline.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const loops = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (/Maximum update depth/.test(m.text())) loops.push(m.text().slice(0, 120)); });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Find echoes near me' }).click();
  await p.locator('.onb').waitFor({ state: 'detached', timeout: 20000 });
  await p.locator('.how-go').click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(2500);
  // Whatever synced at St. James while exploring is real; clear its toast before starting.
  for (let i = 0; i < 4 && (await p.locator('.toast-synced').count()); i++) {
    await p.locator('.toast-synced .toast-close').click().catch(() => {});
    await p.waitForTimeout(400);
  }
  const badge = async () => (await p.locator('.nav').getByRole('button', { name: /My echoes/i }).innerText()).replace(/\D/g, '');
  const foundBefore = await badge();
  await p.getByLabel(/Change your journey/).click();
  await p.waitForTimeout(400);
  await p.locator('.jmenu-item', { hasText: 'Old Wilmington' }).first().click();
  await p.waitForTimeout(2500);
  const sheet = p.locator('.dir-sheet');
  const lead = (await sheet.locator('.dir-sheet-big').innerText().catch(() => '')).trim();
  check('Guided walk: shows the way to the first stop', /^Walk to the start · \d+ min$/.test(lead), lead);
  check('Guided walk: says which stop, of how many',
    /Stop 1 of \d+ · to /.test(await sheet.locator('.dir-sheet-to').innerText().catch(() => '')));
  check('Guided walk: turn by turn at the top', await visible(p.locator('.dir-turn')));
  // Numbered, one badge per stop, as the sheet counts them.
  const of = Number(/of (\d+)/.exec(await sheet.locator('.dir-sheet-to').innerText().catch(() => ''))?.[1] ?? 0);
  check('Guided walk: its stops are on the map, numbered', of > 0 && (await p.locator('g.pw-badge').count()) === of,
    `${await p.locator('g.pw-badge').count()} badges, ${of} stops`);
  const metres = async () => {
    const t = (await sheet.locator('.dir-sheet-how').innerText().catch(() => '')).trim();
    const m = /([\d.,]+)\s*(m|km)\b/.exec(t);
    return m ? Number(m[1].replace(/,/g, '')) * (m[2] === 'km' ? 1000 : 1) : null;
  };
  const away = await metres();
  // St. James is about 470 m from the river where the walk starts. Moved there, it would be 0.
  check('Guided walk: does not move you to the start', away !== null && away > 200, String(away));
  await p.waitForTimeout(8000);
  const later = await metres();
  check('Guided walk: standing still, you stay where you are', later !== null && away !== null && Math.abs(later - away) < 40,
    `${away} then ${later}`);
  const synced = await p.locator('.toast-synced').allInnerTexts();
  check('Guided walk: syncs nothing you have not walked to',
    synced.every((t) => !/Long Walk Beside the River/.test(t)) && (await badge()) === foundBefore,
    `${synced.join(' / ')} · My Echoes ${foundBefore} then ${await badge()}`);
  check('Guided walk: no render loop', loops.length === 0, loops[0] ?? '');
  await sheet.getByRole('button', { name: 'End the walk' }).click().catch(() => {});
  await p.waitForTimeout(600);
  check('Guided walk: End the walk puts the directions away', !(await visible(p.locator('.dir-sheet'))));
  await ctx.close();
}

await browser.close();
console.log(`\nPAGE ERRORS: ${errors.length ? errors.join(' | ') : 'none'}`);
if (failures.length || errors.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('flows: every way in has a way out');
process.exit(0);
