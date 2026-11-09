#!/usr/bin/env node
/**
 * Compile the YAML library into a TypeScript module the prototype can import.
 *
 * Keeps `content/` the single source of truth rather than letting the app carry its own
 * copy of the echoes — a demo that drifts from the real library stops telling you anything
 * about the real library.
 */

import { readdir, readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { isVerified, parseEcho, validateLibrary, withRemoteness } from "@echofinders/core";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "apps", "prototype", "src", "library.generated.ts");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.ya?ml$/.test(entry.name)) yield path;
  }
}

const voices = parseYaml(await readFile(join(ROOT, "content", "voices.yml"), "utf8"));

const echoes = [];
for await (const path of walk(join(ROOT, "content", "echoes"))) {
  const { echo, issues } = parseEcho(parseYaml(await readFile(path, "utf8")), relative(ROOT, path));
  if (!echo) {
    console.error(`skipped ${relative(ROOT, path)}:`, issues.map((i) => i.message).join("; "));
    continue;
  }
  echoes.push(echo);
}

echoes.sort((a, b) => a.id.localeCompare(b.id));

// The prototype needs playable content, and the whole library is correctly sitting at
// `draft` / `unchecked` because nobody has verified it against primary sources yet
// (see content/echoes/README.md). The engine refuses to serve unapproved echoes, which is
// exactly right and means the demo would show an empty map.
//
// So the generated module carries a clearly-labelled demo copy with those two fields
// overridden. The content files are untouched: nothing here promotes anything, and the
// override exists only in a build artefact nobody ships.
/*
 * No drawn stand-in photographs (James, 2026-11-09). Seven New York demo echoes used to get a
 * made-up archive plate here, whose image key pointed at a file that never existed, so their
 * cards showed a broken image. An echo shows a photograph only when a cleared one is in
 * `content/archive/` and named in its own content file; otherwise it shows none.
 */

// Remoteness is measured from the library itself (`remotenessOf`): how far each echo sits
// off the walk most people take. Shipped with the echo so `rarityOf` needs nothing else.
const placed = withRemoteness(echoes);

const demo = placed.map((echo) => ({
  ...echo,
  editorial: "approved",
  factCheck: "corroborated",
  // DEMO ONLY: a stand-in render so the playback path has something to play.
  //
  // Nothing has been through ElevenLabs yet, and an echo with no `renders` cannot be
  // played by anything — which would leave the entire audio path, the queue included,
  // untestable until the day the first real file lands. So each echo gets one render
  // pointing at `speech/<id>`, which the prototype resolves to the browser's own speech
  // synthesis reading the script aloud.
  //
  // It is a genuinely useful stand-in rather than silence: the words are the real words,
  // so the writing can be judged *spoken* rather than read, which is the only way it is
  // ever going to be experienced. The duration is the estimate from the content file and
  // will be wrong; the real figure arrives with the real render.
  //
  // A real render, where one exists, is kept as it is: `apps/prototype/src/narration.ts`
  // plays the file and keeps the stand-in for everything else.
  ...(echo.script && !echo.renders?.length
    ? {
        renders: [
          {
            voiceId: echo.voice ?? voices.defaultVoiceId,
            audioKey: `speech/${echo.id}`,
            durationS: echo.durationS,
          },
        ],
      }
    : {}),
}));

// Validate what the prototype will actually serve, which means after the override rather
// than before it.
//
// Before, and the build fails on the very state the override exists to paper over — most
// visibly for true crime, which has its own rule requiring corroboration and so failed
// here while every other draft echo sailed through on a rule this script had already
// decided to set aside. Two gates disagreeing about the same fact is worse than either.
//
// Nothing is weakened: every other rule still runs, and the gate that decides what may be
// *published* is `npm run content:validate`, which reads the content files as authored and
// still reports those echoes as errors. This one only decides what a local demo can show.
const report = validateLibrary(demo);
// The same bargain as the approval override above: an echo needs every checkable sentence
// backed by a quoted source before it may be *published* (`claims.backing`), and none is
// yet. That rule is the publishing gate's, `content:validate`; the demo plays drafts.
// Malformed claims (`claims`) still fail here.
//
// Sources are the same bargain (ADR-0016, James 2026-10-09). A draft may cite any
// credible, linked source and must swap it for a public record before approval. The demo
// copy is "approved" only so it can play, so those approval-only source rules belong to
// the publishing gate too, which still enforces them on the files as authored.
const approvalOnly = (i) =>
  i.field === "claims.backing" ||
  /^sources\[\d+\]\.rights$/.test(i.field) ||
  (i.field === "sources" && /public record/.test(i.message)) ||
  // How an unproven case is worded is checked at approval, on the script as written.
  (i.field === "script" && /told as alleged|exoneration must be said/.test(i.message));
const blocking = report.issues.filter((i) => i.severity === "error" && !approvalOnly(i));
if (blocking.length > 0) {
  console.error("library has errors; run npm run content:validate");
  process.exit(1);
}

// Every route in the library, not just the walk. The prototype lets you switch between
// travel modes, and the whole point of that switch is that the same engine and the same
// content directory drive all of them — a demo that only ever ran one mode would prove
// nothing about the other four.
const routeFiles = (await readdir(join(ROOT, "content", "routes"))).filter((f) => /\.ya?ml$/.test(f)).sort();
const routes = [];
// A drive's traced road, when `scripts/build-route-paths.py` has written one beside it.
const pathOf = async (id) => {
  try {
    const traced = JSON.parse(await readFile(join(ROOT, "content", "routes", `${id}.path.json`), "utf8"));
    return traced.path.map(([lat, lng]) => ({ lat, lng }));
  } catch {
    return null;
  }
};
for (const file of routeFiles) {
  const route = parseYaml(await readFile(join(ROOT, "content", "routes", file), "utf8"));
  const path = await pathOf(route.id);
  routes.push({
    id: route.id,
    mode: route.mode,
    name: route.name,
    ...(route.area ? { area: route.area } : {}),
    origin: route.origin,
    destination: route.destination,
    waypoints: route.waypoints,
    durationS: route.durationS,
    // Content files carry no departure time: when a journey starts is a runtime fact, not
    // an editorial one. The prototype needs a fixed one so its simulated clock is stable.
    departureAt: "2026-06-15T14:00:00Z",
    ...(route.cruiseAltitudeFt ? { cruiseAltitudeFt: route.cruiseAltitudeFt } : {}),
    ...(path ? { path } : {}),
  });
}

const verified = echoes.filter(isVerified).map((echo) => echo.id);

// Routes as readable JSON, except a traced road, which is a thousand points and goes on
// one line rather than four thousand.
function routesJson(list) {
  const paths = [];
  const text = JSON.stringify(
    list.map((r) => (r.path ? { ...r, path: `@@path${paths.push(r.path) - 1}@@` } : r)),
    null,
    2,
  );
  return text.replace(/"@@path(\d+)@@"/g, (_, i) => JSON.stringify(paths[Number(i)]));
}

/**
 * What the phone is sent, which is less than what the editor keeps.
 *
 * James (2026-10-24): "I dont want users to see sources." Nothing ever drew them, but the
 * whole echo record was being serialised into the bundle, so every citation was sitting in
 * the page for anyone who opened devtools. Two fields come out here, after validation has
 * run against the full record, so nothing is weakened by their absence:
 *
 *   sources   citations, for review. Emptied rather than deleted, because `Echo` requires
 *             the field and an empty array keeps the type honest about what shipped.
 *   claims    each checkable sentence beside its quoted passage. Reviewer scaffolding,
 *             already optional, and the one that matters for weight: the library is 969 KB
 *             today, and quoting all 2,433 checkable sentences would add about 587 KB of
 *             text no listener will ever be shown, carried over a plane's wifi and counted
 *             against the offline budgets in `modes.ts`.
 *
 * What stays, and why, so nobody strips it next:
 *
 *   certainty       `truthOf` reads it for the mark on the card, player and My Echoes.
 *   certaintyNote   the disclosure behind that mark. Nothing draws it yet; it should.
 *   editorial,
 *   factCheck       kept for now. The mark reads VERIFIED_IDS rather than these, so they
 *                   could follow, but they are two short strings and removing them means
 *                   narrowing the exported type.
 *   trueCrimeReview `score.ts` refuses to play a true-crime echo that has none, so its
 *                   presence is load-bearing. Note that its `reviewedBy` is a real
 *                   person's name and currently ships; reducing it to a presence flag
 *                   needs a type change and is worth doing separately.
 */
const shipped = demo.map(({ claims, ...echo }) => ({ ...echo, sources: [] }));

/**
 * The rendered audio, copied to where the app serves it: `audio/<id>/<voice>.mp3` in a
 * render becomes `/audio/<id>/<voice>.mp3` on the site.
 *
 * Copied fresh every build, so a file that left the library leaves the site too. Served
 * from Vercel with the app, as the map is (ADR-0019), while the library is small; R2 is
 * the plan once it is not (`01-services.md`).
 */
const AUDIO_OUT = join(ROOT, "apps", "prototype", "public", "audio");
await rm(AUDIO_OUT, { recursive: true, force: true });
let audioFiles = 0;
for (const echo of echoes) {
  for (const render of echo.renders ?? []) {
    if (!render.audioKey.startsWith("audio/")) continue;
    const to = join(ROOT, "apps", "prototype", "public", render.audioKey);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(ROOT, "content", render.audioKey), to);
    audioFiles++;
  }
}
console.log(`copied ${audioFiles} rendered audio file(s) to apps/prototype/public/audio`);

/**
 * Archive photographs, the same way: `archive/<file>` in an echo's `archive` list is
 * `content/archive/<file>` here and `/archive/<file>` on the site. Only real files under
 * `archive/` are copied.
 */
const ARCHIVE_OUT = join(ROOT, "apps", "prototype", "public", "archive");
await rm(ARCHIVE_OUT, { recursive: true, force: true });
const archiveFiles = new Set();
for (const echo of echoes) {
  for (const photo of echo.archive ?? []) {
    if (!photo.imageKey.startsWith("archive/") || archiveFiles.has(photo.imageKey)) continue;
    const to = join(ROOT, "apps", "prototype", "public", photo.imageKey);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(ROOT, "content", photo.imageKey), to);
    archiveFiles.add(photo.imageKey);
  }
}
console.log(`copied ${archiveFiles.size} archive photograph(s) to apps/prototype/public/archive`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  `// Generated by scripts/build-library.mjs — do not edit.\n` +
    `// Source of truth is content/. Run \`npm run library:build\` after changing it.\n\n` +
    `import type { Echo, Route } from "@echofinders/core";\n\n` +
    `// DEMO ONLY: editorial status is overridden to "approved" so the prototype has\n` +
    `// something to play. The real library in content/ is untouched and still awaiting\n` +
    `// human fact-checking. Never import this into anything that ships.\n` +
    `export const LIBRARY: readonly Echo[] = ${JSON.stringify(shipped, null, 2)} as const;\n\n` +
    `export const ROUTES: readonly Route[] = ${routesJson(routes)} as const;\n\n` +
    `// What a person has really checked, as authored, before the demo override above. The\n` +
    `// "true story" mark reads this, never the overridden status (\`truth.ts\` in the engine).\n` +
    `export const VERIFIED_IDS: ReadonlySet<string> = new Set(${JSON.stringify(verified)});\n`,
  "utf8",
);

console.log(`wrote ${echoes.length} echoes to ${relative(ROOT, OUT)}`);
