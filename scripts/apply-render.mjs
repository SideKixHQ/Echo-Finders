#!/usr/bin/env node
/**
 * Write a finished render into its echo's YAML file.
 *
 *   node scripts/render-echo.mjs content/echoes/arts/x.yml     # makes the audio
 *   node scripts/apply-render.mjs content/echoes/arts/x.yml    # records it
 *
 * `render-echo.mjs` drops `<voiceId>.render.json` beside the audio. This reads it and sets
 * the echo's `renders` entry for that voice, replacing an older render of the same voice
 * rather than adding a second. Comments and the rest of the file are kept.
 *
 * It also sets `durationS` to the measured length. The file's figure was an estimate from
 * the character count, and the scheduler packs against it: an echo declared at 67s that
 * plays for 54s leaves thirteen seconds of silence in every walk that reaches it.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/apply-render.mjs <echo.yml>...");
  process.exit(1);
}

for (const file of files) {
  const doc = parseDocument(await readFile(file, "utf8"));
  const id = doc.get("id");
  const dir = join("content", "audio", id);
  let names;
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".render.json")).sort();
  } catch {
    console.error(`${file}: no renders in ${dir}; run scripts/render-echo.mjs first`);
    process.exitCode = 1;
    continue;
  }

  const existing = doc.get("renders")?.toJSON?.() ?? [];
  const byVoice = new Map(existing.map((r) => [r.voiceId, r]));
  for (const name of names) {
    const render = JSON.parse(await readFile(join(dir, name), "utf8"));
    byVoice.set(render.voiceId, render);
  }

  // The cast voice first, so `renderFor` with no voice preference picks the one the echo
  // was written for.
  const cast = doc.get("voice");
  const renders = [...byVoice.values()].sort((a, b) =>
    a.voiceId === cast ? -1 : b.voiceId === cast ? 1 : a.voiceId.localeCompare(b.voiceId),
  );

  const lead = renders[0];
  doc.set("durationS", Math.round(lead.durationS));
  doc.set("renders", doc.createNode(renders));
  // The library writes flow maps padded and flow lists not (`at: { lat, lng }`,
  // `tags: [a, b]`); the yaml library pads both or neither, so put the maps back.
  const text = doc
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .replace(/^(\s*[\w-]+: )\{([^{}\n]+)\}$/gm, "$1{ $2 }");
  await writeFile(file, text);
  console.log(`${file}: ${renders.length} render(s), durationS ${Math.round(lead.durationS)}`);
}
