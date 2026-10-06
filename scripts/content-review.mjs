#!/usr/bin/env node
/**
 * A one-page review sheet for one echo.
 *
 *   npm run content:review -- castle-clinton-eight-million > review.md
 *
 * Every checkable sentence of the script beside the passage that backs it and a link to
 * the source, so the reviewer reads a quote and says yes or no instead of hunting through
 * pages for "1855". Sentences with no quote yet are listed first, because that is the work
 * left. The full script follows, since a mechanical check cannot see every claim — a
 * reviewer still reads all of it.
 */

import { checkClaims } from "@echofinders/core";
import { loadEchoes, statusOf } from "./content-status.mjs";

const id = process.argv.slice(2).find((a) => !a.startsWith("-"));
if (!id) {
  console.error("Usage: npm run content:review -- <echo-id>");
  process.exit(1);
}

const all = await loadEchoes();
const found = all.find((e) => e.echo.id === id);
if (!found) {
  console.error(`No echo "${id}". Run npm run content:status for the list.`);
  process.exit(1);
}

const { echo } = found;
const status = statusOf(found);
const claims = checkClaims(echo);
const sourceLine = (n) => {
  const s = echo.sources[n - 1];
  if (!s) return `source ${n} (not listed)`;
  return `[${n}] ${s.publisher}, "${s.title}"${s.url ? ` <${s.url}>` : ""} · ${s.rights}`;
};

const out = [];
out.push(`# Review: ${echo.title}`, "");
out.push(`\`${found.file}\` · ${echo.category} · ${echo.editorial} · facts ${echo.factCheck}`);
out.push(`Still needs: ${status.needs.length ? status.needs.join(", ") : "nothing; ready to approve"}`, "");

const missing = claims.checkable.filter((c) => !c.claim);
const backed = claims.checkable.filter((c) => c.claim);

out.push(`## Not yet backed (${missing.length})`, "");
if (missing.length === 0) out.push("None.", "");
for (const { sentence } of missing) out.push(`- [ ] ${sentence}`);
if (missing.length) out.push("");

out.push(`## Backed (${backed.length}): check each quote is really in its source`, "");
for (const { sentence, claim } of backed) {
  out.push(`- [ ] **${sentence}**`);
  out.push(`  > ${claim.quote.replace(/\s+/g, " ").trim()}`);
  out.push(`  ${sourceLine(claim.source)}`, "");
}

const problems = [
  ...claims.badSource.map((c) => `cites a source that is not listed: "${c.says}"`),
  ...claims.unquoted.map((c) => `has no quote: "${c.says}"`),
  ...claims.orphaned.map((c) => `is no longer in the script: "${c.says}"`),
];
if (problems.length) {
  out.push(`## Broken claims (${problems.length})`, "");
  for (const p of problems) out.push(`- ${p}`);
  out.push("");
}

out.push("## Sources", "");
echo.sources.forEach((_, i) => out.push(`- ${sourceLine(i + 1)}`));
out.push("", "## Full script (read all of it)", "", echo.script ?? "(no script)", "");
if (echo.category === "true-crime") {
  out.push("## True crime", "", "Read docs/protection-policy.md. Two sources, three if a living person was not convicted, one a primary public record, a named reviewer.", "");
}

console.log(out.join("\n"));
