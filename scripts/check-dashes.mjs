#!/usr/bin/env node
/**
 * No dashes in anything a listener or visitor reads (James, 2026-11-09: "We dont use dashes
 * in user facing writing or copy. That goes for the app and the website").
 *
 * A dash here is an em dash, an en dash, or a hyphen standing alone between spaces as one.
 * Hyphens inside words (All-Access, Wright-Burgwin) are spelling, not dashes, and pass.
 *
 * What is read, and only that, so developer comments (which no one outside sees) are not:
 *   - string literals, template text and JSX text in apps/prototype/src, apps/site/src and
 *     packages/echo/src, found with the TypeScript parser, so comments never count;
 *   - the policy pages the website publishes (docs/privacy-policy.md, terms, refunds);
 *   - every echo's title, teaser, summary, place, script, content warning and photo caption.
 *
 *   node scripts/check-dashes.mjs          report, exit 1 on any
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { parse } from "yaml";

const ROOT = new URL("..", import.meta.url).pathname;
const DASH = /[–—]|\s-\s/;
const hits = [];
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (f === "node_modules" || f.startsWith(".")) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const where = (file, line) => `${relative(ROOT, file)}:${line}`;

// 1. Source text the user sees.
for (const dir of ["apps/prototype/src", "apps/site/src", "packages/echo/src"]) {
  for (const file of walk(join(ROOT, dir)).filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.endsWith(".generated.ts") && !/\.test\./.test(f))) {
    const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      let text = null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
      else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
      else if (ts.isJsxText(node)) text = node.text;
      // Not user-facing: import paths, CSS class names and the like contain no spaced dashes or em dashes anyway.
      if (text && DASH.test(text) && !ts.isImportDeclaration(node.parent)) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart());
        hits.push(`${where(file, line + 1)}  ${JSON.stringify(text.trim().slice(0, 90))}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
}

// 2. Pages the website publishes.
for (const f of ["docs/privacy-policy.md", "docs/terms-of-service.md", "docs/refund-policy.md"]) {
  readFileSync(join(ROOT, f), "utf8").split("\n").forEach((l, i) => {
    if (DASH.test(l.replace(/^\s*-\s/, ""))) hits.push(`${f}:${i + 1}  ${JSON.stringify(l.trim().slice(0, 90))}`);
  });
}

// 2b. The HTML shells: page titles, link previews, and the lock test page testers open.
for (const f of ["apps/site/index.html", "apps/prototype/index.html", ...readdirSync(join(ROOT, "apps/prototype/public")).filter((n) => n.endsWith(".html")).map((n) => `apps/prototype/public/${n}`)]) {
  // Scripts and styles are code, not copy: blanked, keeping line numbers.
  const html = readFileSync(join(ROOT, f), "utf8").replace(/<(script|style)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""));
  html.split("\n").forEach((l, i) => {
    if (DASH.test(l)) hits.push(`${f}:${i + 1}  ${JSON.stringify(l.trim().slice(0, 90))}`);
  });
}

// 3. What every echo says and shows.
for (const file of walk(join(ROOT, "content/echoes")).filter((f) => f.endsWith(".yml"))) {
  const e = parse(readFileSync(file, "utf8"));
  const fields = { title: e.title, teaser: e.teaser, summary: e.summary, place: e.place, script: e.script,
    contentWarning: e.trueCrimeReview?.contentWarning, certaintyNote: e.certaintyNote,
    ...Object.fromEntries((e.archive ?? []).map((a, i) => [`archive[${i}].caption`, a.caption])) };
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string" && DASH.test(v)) hits.push(`${relative(ROOT, file)} ${k}  ${JSON.stringify(v.match(/.{0,40}(?:[–—]|\s-\s).{0,40}/)?.[0] ?? "")}`);
}

if (hits.length) {
  console.log(hits.join("\n"));
  console.log(`\n${hits.length} dash(es) in user-facing text. Rewrite with a full stop, a comma, a colon or "to".`);
  process.exit(1);
}
console.log("no dashes in user-facing text");
