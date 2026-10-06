#!/usr/bin/env node
/**
 * What every echo still needs before it can be approved.
 *
 *   npm run content:status            a table, one row per echo, and the totals
 *   npm run content:status -- --json  the same, for anything that wants to read it
 *
 * The library is the asset and nothing in it is approved yet (docs/10-blockers.md, #1).
 * This is the editor's to-do list: for each echo, how many of its checkable sentences
 * have a quoted source (`claims`, see packages/core/src/content/claims.ts), whether it has
 * real audio and a real archive photograph, and whether true crime has a named reviewer.
 * It reports; it never fails the build. `content:validate` is the gate.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { checkClaims, parseEcho, validateEcho } from "@echofinders/core";

const ROOT = new URL("..", import.meta.url).pathname;
const ECHO_DIR = join(ROOT, "content", "echoes");

export async function* echoFiles(dir = ECHO_DIR) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* echoFiles(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

export async function loadEchoes() {
  const out = [];
  for await (const path of echoFiles()) {
    const file = relative(ROOT, path);
    const raw = parseYaml(await readFile(path, "utf8"));
    const { echo } = parseEcho(raw, file);
    if (echo) out.push({ echo, file, raw });
  }
  return out;
}

/** One echo's readiness, as plain data. */
export function statusOf({ echo, file, raw }) {
  const claims = checkClaims(echo);
  const backed = claims.checkable.filter((c) => c.claim).length;
  const errors = validateEcho(echo).filter((i) => i.severity === "error").length;
  const trueCrime = echo.category === "true-crime";
  const reviewer = trueCrime ? (raw?.trueCrimeReview?.reviewedBy ?? "") : null;
  const reviewerNamed = reviewer === null || (reviewer.trim() && !/^todo/i.test(reviewer.trim()));

  const needs = [];
  if (backed < claims.checkable.length) {
    needs.push(`quote sources for ${claims.checkable.length - backed} sentence(s)`);
  }
  if (claims.badSource.length + claims.unquoted.length + claims.orphaned.length > 0) {
    needs.push("fix broken claims");
  }
  if (echo.factCheck === "unchecked" || echo.factCheck === "disputed") needs.push("fact-check");
  if (trueCrime && !reviewerNamed) needs.push("named true-crime reviewer");
  if (!echo.renders?.length) needs.push("render audio");
  if (!echo.archive?.length) needs.push("archive photo");
  if (echo.editorial !== "approved") needs.push("editor approval");

  return {
    id: echo.id,
    file,
    category: echo.category,
    editorial: echo.editorial,
    factCheck: echo.factCheck,
    claims: { backed, checkable: claims.checkable.length },
    audio: Boolean(echo.renders?.length),
    photo: Boolean(echo.archive?.length),
    errors,
    needs,
  };
}

async function main() {
  const rows = (await loadEchoes()).map(statusOf);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const pad = (s, n) => String(s).padEnd(n);
  const tick = (b) => (b ? "yes" : "-");
  console.log(
    `${pad("echo", 36)}${pad("state", 10)}${pad("facts", 13)}${pad("claims", 8)}${pad("audio", 6)}${pad("photo", 6)}needs`,
  );
  for (const r of rows) {
    console.log(
      pad(r.id, 36) +
        pad(r.editorial, 10) +
        pad(r.factCheck, 13) +
        pad(`${r.claims.backed}/${r.claims.checkable}`, 8) +
        pad(tick(r.audio), 6) +
        pad(tick(r.photo), 6) +
        (r.needs.length ? r.needs.join(", ") : "ready"),
    );
  }

  const approved = rows.filter((r) => r.editorial === "approved").length;
  const sentences = rows.reduce((n, r) => n + r.claims.checkable, 0);
  const backed = rows.reduce((n, r) => n + r.claims.backed, 0);
  console.log(
    `\n${rows.length} echoes · ${approved} approved · ` +
      `${backed} of ${sentences} checkable sentences quoted · ` +
      `${rows.filter((r) => r.audio).length} with audio · ${rows.filter((r) => r.photo).length} with a photo`,
  );
  console.log("Review sheet for one echo: npm run content:review -- <id>");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
