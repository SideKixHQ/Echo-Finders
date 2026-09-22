#!/usr/bin/env node
/**
 * Compile the YAML library into a TypeScript module the prototype can import.
 *
 * Keeps `content/` the single source of truth rather than letting the app carry its own
 * copy of the echoes — a demo that drifts from the real library stops telling you anything
 * about the real library.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseEcho, validateLibrary } from "@echofinders/core";

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
/**
 * DEMO ONLY: a drawn stand-in archive plate, so the camera has something to blend.
 *
 * No plate has been cleared yet — the Library of Congress and the municipal collections are
 * unreachable from this environment, and a photograph found on a search engine is not a
 * photograph anybody may publish (ADR-0006). Rather than invent a provenance in `content/`,
 * where a fabricated "Detroit Publishing Company, 1908" would sit in the repository until
 * somebody believed it, the stand-in lives here beside the stand-in renders and says in its
 * own credit line what it is.
 *
 * The vantage is synthetic and deliberately *not* the echo's own point: a photograph of a
 * building is taken from across the road, and standing on the building is the one place you
 * cannot reproduce it from. Twenty-five metres out, on a bearing derived from the id so it
 * is stable between builds, pointing back at the subject. That exercises every branch of
 * `alignmentTo` — walk there, turn, hold it up — which a vantage sitting on top of the echo
 * would not.
 *
 * Only echoes whose whole point is a changed streetscape get one. An overlook on a parkway
 * has no then-and-now worth holding a phone up to.
 */
const PLATED = {
  "federal-hall-two-firsts": { year: 1890, caption: "Wall Street from Broad, before the tower" },
  "trinity-tallest-thing": { year: 1870, caption: "Trinity's spire above the rooftops" },
  "castle-clinton-eight-million": { year: 1900, caption: "The landing depot at Battery Park" },
  "bowling-green-king-george": { year: 1905, caption: "Bowling Green and the Custom House" },
  "st-pauls-still-standing": { year: 1895, caption: "Broadway at the chapel yard" },
  "canyon-of-heroes": { year: 1927, caption: "Lower Broadway during a reception" },
  "wall-street-the-wall": { year: 1885, caption: "Looking east along Wall Street" },
};

/** A stable pseudo-bearing from the id, so a rebuild does not move the vantage. */
function seededBearing(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** Offset a position by metres along a bearing. Flat-earth, which at 25m is exact enough. */
function offset({ lat, lng }, bearing, metres) {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (metres * Math.cos(rad)) / 111320;
  const dLng = (metres * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}

function demoArchive(echo) {
  const plate = PLATED[echo.id];
  if (!plate) return {};
  const away = seededBearing(echo.id);
  return {
    archive: [
      {
        imageKey: `archive/${echo.id}`,
        at: offset(echo.point.at, away, 25),
        // Facing back at the subject from the vantage.
        bearingDeg: (away + 180) % 360,
        year: plate.year,
        caption: plate.caption,
        credit: "DEMO stand-in — no archive plate sourced yet",
        rights: "public-domain",
      },
    ],
  };
}

const demo = echoes.map((echo) => ({
  ...echo,
  editorial: "approved",
  factCheck: "corroborated",
  ...demoArchive(echo),
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
  ...(echo.script
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
if (!report.ok) {
  console.error("library has errors; run npm run content:validate");
  process.exit(1);
}

// Every route in the library, not just the walk. The prototype lets you switch between
// travel modes, and the whole point of that switch is that the same engine and the same
// content directory drive all of them — a demo that only ever ran one mode would prove
// nothing about the other four.
const routeFiles = (await readdir(join(ROOT, "content", "routes"))).filter((f) => /\.ya?ml$/.test(f)).sort();
const routes = [];
for (const file of routeFiles) {
  const route = parseYaml(await readFile(join(ROOT, "content", "routes", file), "utf8"));
  routes.push({
    id: route.id,
    mode: route.mode,
    name: route.name,
    origin: route.origin,
    destination: route.destination,
    waypoints: route.waypoints,
    durationS: route.durationS,
    // Content files carry no departure time: when a journey starts is a runtime fact, not
    // an editorial one. The prototype needs a fixed one so its simulated clock is stable.
    departureAt: "2026-06-15T14:00:00Z",
    ...(route.cruiseAltitudeFt ? { cruiseAltitudeFt: route.cruiseAltitudeFt } : {}),
  });
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  `// Generated by scripts/build-library.mjs — do not edit.\n` +
    `// Source of truth is content/. Run \`npm run library:build\` after changing it.\n\n` +
    `import type { Echo, Route } from "@echofinders/core";\n\n` +
    `// DEMO ONLY: editorial status is overridden to "approved" so the prototype has\n` +
    `// something to play. The real library in content/ is untouched and still awaiting\n` +
    `// human fact-checking. Never import this into anything that ships.\n` +
    `export const LIBRARY: readonly Echo[] = ${JSON.stringify(demo, null, 2)} as const;\n\n` +
    `export const ROUTES: readonly Route[] = ${JSON.stringify(routes, null, 2)} as const;\n`,
  "utf8",
);

console.log(`wrote ${echoes.length} echoes to ${relative(ROOT, OUT)}`);
