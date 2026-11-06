#!/usr/bin/env node
/**
 * Validate the echo library.
 *
 * Runs in CI (ADR-0005), so a file that breaks an editorial rule fails the build rather
 * than reaching a listener. The rules themselves live in `@echofinders/core` and are
 * tested there; this script only finds the files, parses the YAML and prints the result.
 *
 * It also enforces the one house style rule that is not in `@echofinders/core`, because it
 * is about writing rather than about the model: no dashes in anything a listener reads.
 *
 * Exits non-zero on any error. Warnings are printed and tolerated — they are advice to an
 * editor, not a broken library.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseEcho, validateLibrary } from "@echofinders/core";

const ROOT = new URL("..", import.meta.url).pathname;
const ECHO_DIR = join(ROOT, "content", "echoes");

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

const RESET = "\u001b[0m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const GREEN = "\u001b[32m";
const DIM = "\u001b[2m";

const echoes = [];
const issues = [];

for await (const path of walk(ECHO_DIR)) {
  const rel = relative(ROOT, path);
  let raw;
  try {
    raw = parseYaml(await readFile(path, "utf8"));
  } catch (error) {
    issues.push({ echoId: rel, severity: "error", field: "<yaml>", message: error.message });
    continue;
  }

  const { echo, issues: parseIssues } = parseEcho(raw, rel);
  issues.push(...parseIssues.map((i) => ({ ...i, file: rel })));
  if (echo) echoes.push({ echo, file: rel });
}

/**
 * House style: no dashes.
 *
 * Not a preference about typography. A dash is the punctuation you reach for when you have
 * not decided what the relationship between two clauses is, and the writing gets vaguer
 * every time one goes in. A full stop, a comma or a colon each commit to something.
 *
 * Cited document titles are exempt, and only them: "Blue Ridge Parkway — Linville Falls" is
 * the actual title of somebody else's record, and editing it would make the citation wrong.
 * Everything a listener reads or hears is ours and follows the rule.
 *
 * Hyphens inside words are not dashes. "Thirty-five" is one word with a hyphen in it.
 */
const DASH = /[\u2014\u2013]/;
const PROSE = ["title", "teaser", "summary", "script"];
for (const { echo, file } of echoes) {
  const fields = [
    ...PROSE.map((f) => [f, echo[f]]),
    ["simple.script", echo.simple?.script],
    ["point.place", echo.point?.place],
  ];
  for (const [field, text] of fields) {
    if (typeof text !== "string" || !DASH.test(text)) continue;
    const line = text.split("\n").find((l) => DASH.test(l)) ?? text;
    issues.push({
      echoId: echo.id, file, severity: "error", field,
      message: `dash in copy (house style): ${line.trim().slice(0, 72)}`,
    });
  }
}

/**
 * Every rendered file is in the repository, and is the file that was rendered.
 *
 * `@echofinders/core` does no I/O, so it can check that a render is well formed but not
 * that its audio exists. A render pointing at a missing file is an echo that cannot play,
 * and the library build would fail copying it; better to be told here, by name.
 */
for (const { echo, file } of echoes) {
  for (const [i, render] of (echo.renders ?? []).entries()) {
    if (!render.audioKey.startsWith("audio/")) continue;
    const push = (message) =>
      issues.push({ echoId: echo.id, severity: "error", field: `renders[${i}].audioKey`, message, file });
    let bytes;
    try {
      bytes = (await stat(join(ROOT, "content", render.audioKey))).size;
    } catch {
      push(`content/${render.audioKey} is missing`);
      continue;
    }
    if (render.audioBytes !== undefined && render.audioBytes !== bytes) {
      push(`content/${render.audioKey} is ${bytes} bytes; the render records ${render.audioBytes}`);
    }
  }
}

/**
 * Every archive photograph named by an echo is in the repository, for the same reason as
 * its audio: a plate pointing at a missing file is a blank frame in the viewfinder.
 */
for (const { echo, file } of echoes) {
  for (const [i, photo] of (echo.archive ?? []).entries()) {
    if (!photo.imageKey.startsWith("archive/")) continue;
    try {
      await stat(join(ROOT, "content", photo.imageKey));
    } catch {
      issues.push({ echoId: echo.id, severity: "error", field: `archive[${i}].imageKey`, message: `content/${photo.imageKey} is missing`, file });
    }
  }
}

/**
 * Casting: each category is read by the voice `content/voices.yml` gives it.
 *
 * A rule James set (2026-11-05), not a judgement made per echo, so it is checked rather
 * than trusted: one ghost story left in the default voice is the sort of thing nobody hears
 * until a listener does.
 */
const voicesFile = parseYaml(await readFile(join(ROOT, "content", "voices.yml"), "utf8"));
for (const { echo, file } of echoes) {
  const want = voicesFile.casting?.[echo.category] ?? voicesFile.defaultVoiceId;
  const have = echo.voice ?? voicesFile.defaultVoiceId;
  if (have !== want) {
    const name = (id) => voicesFile.voices.find((v) => v.id === id)?.role ?? id;
    issues.push({
      echoId: echo.id,
      severity: "error",
      field: "voice",
      message: `a ${echo.category} echo is read by ${name(want)}, not ${name(have)} (content/voices.yml casting)`,
      file,
    });
  }
}

const report = validateLibrary(echoes.map((e) => e.echo));
const fileOf = new Map(echoes.map((e) => [e.echo.id, e.file]));
issues.push(...report.issues.map((i) => ({ ...i, file: fileOf.get(i.echoId) ?? i.echoId })));

const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");

for (const issue of [...errors, ...warnings]) {
  const colour = issue.severity === "error" ? RED : YELLOW;
  const label = issue.severity === "error" ? "error" : "warn ";
  console.log(
    `${colour}${label}${RESET} ${issue.file ?? issue.echoId} ${DIM}${issue.field}${RESET} ${issue.message}`,
  );
}

const approved = echoes.filter((e) => e.echo.editorial === "approved").length;
const drafts = echoes.length - approved;

console.log("");
console.log(
  `${echoes.length} echoes · ${GREEN}${approved} approved${RESET} · ${drafts} awaiting review · ` +
    `${errors.length} error(s) · ${warnings.length} warning(s)`,
);

if (errors.length > 0) process.exit(1);
