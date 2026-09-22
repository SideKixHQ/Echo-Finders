#!/usr/bin/env node
/**
 * Ask ElevenLabs what each narrator in content/voices.yml actually is.
 *
 * Run this on your own machine. Your API key never leaves it, and this script only reads —
 * it changes nothing in your ElevenLabs account and writes nothing anywhere.
 *
 *   export ELEVENLABS_API_KEY=...
 *   node scripts/voice-info.mjs
 *
 * This exists because the ElevenLabs interface does not put "where did this voice come
 * from" anywhere obvious, and the answer is the one fact about a narrator with legal
 * weight. A voice cloned from a real person carries that person's right of publicity — a
 * right that in several US states survives their death and is inherited — and no amount of
 * paying for the TTS makes that go away. A designed or premade voice resembles nobody and
 * carries no such claim.
 *
 * The API knows. `category` on each voice is the definitive answer, and this prints it
 * along with the name and accent, which is everything the TODOs in voices.yml are asking
 * for.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("Set ELEVENLABS_API_KEY first. Do not paste it into a chat or commit it.");
  process.exit(1);
}

/**
 * ElevenLabs' categories, mapped onto the `origin` values voices.yml uses.
 *
 * `premade` and `professional` are ElevenLabs' own catalogue, licensed to us through the
 * plan. `generated` came out of Voice Design and resembles no particular person. `cloned`
 * is the one that matters: it means somebody uploaded recordings of a real human.
 */
const ORIGIN = {
  premade: "stock",
  professional: "stock",
  generated: "designed",
  cloned: "cloned",
};

const NEEDS_CONSENT = new Set(["cloned"]);

const voices = parseYaml(await readFile("content/voices.yml", "utf8"));

let anyCloned = false;

for (const voice of voices.voices ?? []) {
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voice.id}`, {
    headers: { "xi-api-key": key },
  });

  if (!response.ok) {
    console.error(`\n${voice.id}\n  could not read it: ${response.status} ${response.statusText}`);
    continue;
  }

  const data = await response.json();
  const origin = ORIGIN[data.category] ?? `unknown (ElevenLabs says "${data.category}")`;
  const accent = data.labels?.accent;
  const locale = accent ? `${accent} — check whether that is en-GB or en-US` : "not stated";

  console.log(`\n${voice.id}`);
  console.log(`  name:   ${data.name}`);
  console.log(`  locale: ${locale}`);
  console.log(`  origin: ${origin}`);
  if (data.labels?.description) console.log(`  labels: ${data.labels.description}`);
  if (data.sharing?.public_owner_id) {
    console.log(`  source: shared from the Voice Library, not created in this account`);
  }

  if (NEEDS_CONSENT.has(origin)) {
    anyCloned = true;
    console.log(`  ⚠ cloned from a real person. See docs/protection-policy.md, Risk 4.`);
  }
}

console.log(`\nPaste name, locale and origin into content/voices.yml.`);

if (anyCloned) {
  console.log(
    `\nOne or more narrators is a clone of a real person. Before voicing the library at\n` +
      `scale, establish who that person is and that they consented to this use — a clone\n` +
      `engages their right of publicity, which several US states treat as inheritable and\n` +
      `enforceable after death. A Voice Library clone is somebody else's upload: ElevenLabs\n` +
      `requires its contributors to hold consent, but that consent is theirs, not ours, and\n` +
      `the exposure of shipping it inside a product licensed to an airline is ours.`,
  );
} else {
  console.log(
    `\nNo clones. Nothing here resembles a particular real person, so there is no right of\n` +
      `publicity to clear — redistribution is purely a question of the ElevenLabs plan.`,
  );
}
