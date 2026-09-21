#!/usr/bin/env node
/**
 * Validate the echo library.
 *
 * Runs in CI (ADR-0005), so a file that breaks an editorial rule fails the build rather
 * than reaching a listener. The rules themselves live in `@echofinders/core` and are
 * tested there; this script only finds the files, parses the YAML and prints the result.
 *
 * Exits non-zero on any error. Warnings are printed and tolerated — they are advice to an
 * editor, not a broken library.
 */

import { readdir, readFile } from "node:fs/promises";
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
