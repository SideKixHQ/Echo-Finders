#!/usr/bin/env node
/**
 * Ask ElevenLabs what each narrator in content/voices.yml actually is.
 *
 * Run this on your own machine. It only reads: it changes nothing in your ElevenLabs
 * account and writes nothing anywhere.
 *
 *   npx -y @elevenlabs/cli@1.7.1 auth login     # once: opens a browser
 *   node scripts/voice-info.mjs
 *
 * Authentication goes through the ElevenLabs CLI, so there is no API key to find or
 * store; `scripts/elevenlabs-cli.mjs` says why.
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
import { callElevenLabs } from "./elevenlabs-cli.mjs";

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
/*
 * Counted, because the all-clear at the end is a claim about somebody's right of
 * publicity and must not be printed on the strength of lookups that never happened. A run
 * where every voice failed used to end with "No clones", which is the most confident
 * possible way of saying nothing was checked.
 */
let read = 0;
let unread = 0;

for (const voice of voices.voices ?? []) {
  // One stale id should name itself and let the rest of the list run, not end the script.
  const data = callElevenLabs(["voices", "get", "--voice-id", voice.id], { allowFailure: true });
  if (!data) {
    console.error(`  ...that was ${voice.id}, from content/voices.yml. Skipping it.`);
    unread++;
    continue;
  }
  read++;

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
} else if (unread > 0) {
  console.log(
    `\n${unread} of ${read + unread} narrators could not be read, so this run cannot tell you\n` +
      `whether any of them is a clone. That question is still open. Fix the ids above, or\n` +
      `authenticate, and run it again before voicing anything at scale.`,
  );
} else if (read === 0) {
  console.log(`\nNo narrators in content/voices.yml to check.`);
} else {
  console.log(
    `\nNo clones, across all ${read}. Nothing here resembles a particular real person, so there\n` +
      `is no right of publicity to clear — redistribution is purely a question of the\n` +
      `ElevenLabs plan.`,
  );
}
