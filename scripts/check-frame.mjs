#!/usr/bin/env node
/**
 * Nothing escapes the phone.
 *
 * This exists because the same bug shipped twice and a person found it both times.
 *
 * `.synced` and `.walk` were written as `position: fixed; inset: 0`, which resolves
 * against the VIEWPORT rather than against the phone frame. On a phone those are the same
 * rectangle, so it looked perfect in every render ever taken of this app — all of which
 * were 390 wide. On a laptop the sync moment covered the whole window while every other
 * screen stayed in its 390px frame, and "Keep it for later" was a button the width of the
 * desk.
 *
 * The lesson is not "remember to use absolute". It is that a whole class of layout bug is
 * invisible at the only width anybody was testing. So this is a grep, deliberately: it
 * costs nothing, needs no browser, and catches the cause rather than one of its symptoms.
 *
 * If a fixed overlay is ever genuinely wanted, add it to ALLOWED below with the reason.
 * The point is that it becomes a decision somebody writes down, rather than a default
 * nobody notices.
 *
 *   npm run audit:frame
 */

import { readFileSync } from "node:fs";

const FILE = "apps/prototype/src/theme.css";

/** Selectors permitted to position against the viewport, and why. */
const ALLOWED = new Set([
  // None today. Every overlay belongs inside `.screen`, which is `position: relative`.
]);

const css = readFileSync(FILE, "utf8");
const lines = css.split("\n");

/** The selector a line belongs to: the nearest `{`-opening line above it. */
function selectorFor(index) {
  for (let i = index; i >= 0; i--) {
    const line = lines[i] ?? "";
    const m = /^([.#:@a-zA-Z][^{]*)\{\s*$/.exec(line.trim()) ?? /^([.#:][^{]*)\{/.exec(line.trim());
    if (m) return m[1].trim();
  }
  return "(unknown)";
}

const offenders = [];
lines.forEach((line, i) => {
  if (!/position:\s*fixed/.test(line)) return;
  const selector = selectorFor(i);
  if (ALLOWED.has(selector)) return;
  offenders.push({ line: i + 1, selector, text: line.trim() });
});

console.log(`=== ${FILE}: overlays that escape the phone frame ===\n`);
if (offenders.length === 0) {
  console.log("POSITION FIXED: none\n");
  console.log("Every overlay resolves against `.screen`, so nothing spills onto the desk.");
  process.exit(0);
}

for (const o of offenders) {
  console.log(`  ${FILE}:${o.line}  ${o.selector}  ${o.text}`);
}
console.log(
  `\nPOSITION FIXED: ${offenders.length}\n\n` +
    "`fixed` resolves against the viewport, not the phone frame, so these cover the whole\n" +
    "window on any screen wider than a phone — and look perfect in a 390px render.\n" +
    "Use `position: absolute`: `.screen` is relative and will contain it. If one of these\n" +
    "genuinely has to be viewport-fixed, add its selector to ALLOWED in this file with the\n" +
    "reason, so it is a decision rather than an accident.",
);
process.exit(1);
