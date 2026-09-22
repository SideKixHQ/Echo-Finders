#!/usr/bin/env node
/**
 * Render one echo to audio with ElevenLabs.
 *
 * Run this on your own machine. Your API key never leaves it, and this script never sends
 * anything anywhere except to ElevenLabs.
 *
 *   export ELEVENLABS_API_KEY=...
 *   node scripts/render-echo.mjs content/echoes/history/bowling-green-king-george.yml
 *
 * Writes the audio next to the echo and prints a `renders:` block to paste into the file.
 *
 * It uses the `/with-timestamps` endpoint, which returns character-level timings alongside
 * the audio. That matters: transcript timings belong to a *render*, and estimating them
 * from word count drifts badly over a long echo. These are measured.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

const API = "https://api.elevenlabs.io/v1/text-to-speech";

const [, , echoPath, voiceArg] = process.argv;
if (!echoPath) {
  console.error("usage: node scripts/render-echo.mjs <echo.yml> [voiceId]");
  process.exit(1);
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("Set ELEVENLABS_API_KEY first. Do not paste it into a chat or commit it.");
  process.exit(1);
}

const voices = parseYaml(await readFile("content/voices.yml", "utf8"));
const echo = parseYaml(await readFile(echoPath, "utf8"));

// An explicit argument wins, then the echo's own casting, then the default narrator.
// Honouring the cast matters: an echo written for the kids voice read by the documentary
// narrator is the wrong product, and nothing downstream would flag it.
const voiceId = voiceArg ?? echo.voice ?? voices.defaultVoiceId;

if (!voiceArg && echo.voice) {
  console.log(`Using the voice this echo is cast to: ${echo.voice}`);
} else if (!voiceArg && echo.category === "kids") {
  console.warn(
    `  ${echo.id} is a kids echo with no \`voice:\` set — it will be read by the default ` +
      `narrator. Cast it to the kids voice first.`,
  );
}
if (!echo.script) {
  console.error(`${echoPath} has no script to read.`);
  process.exit(1);
}

/**
 * Sentences, as the transcript will show them.
 *
 * Split on sentence-ending punctuation followed by whitespace. Blank lines in the script
 * are paragraph breaks and are not sentence boundaries, so they collapse first.
 */
const displaySentences = echo.script
  .replace(/\s*\n\s*\n\s*/g, " ")
  .replace(/\s*\n\s*/g, " ")
  .trim()
  .split(/(?<=[.!?])\s+/)
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Apply the echo's pronunciation notes before sending.
 *
 * Crude but effective: respelling "Duane" as "doo-AYN" makes the engine say it correctly.
 * The substitution changes the characters, so timings are computed against the spoken text
 * while the transcript keeps the original words — which is what a reader should see.
 */
function speak(text) {
  let spoken = text;
  for (const p of echo.pronunciations ?? []) {
    spoken = spoken.split(p.written).join(p.say);
  }
  return spoken;
}

const spokenSentences = displaySentences.map(speak);
const spokenText = spokenSentences.join(" ");

console.log(`Rendering ${echo.id} · ${displaySentences.length} sentences · voice ${voiceId}`);

const response = await fetch(`${API}/${voiceId}/with-timestamps`, {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({
    text: spokenText,
    model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  }),
});

if (!response.ok) {
  console.error(`ElevenLabs returned ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const result = await response.json();
const audio = Buffer.from(result.audio_base64, "base64");

const outDir = join("content", "audio", echo.id);
await mkdir(outDir, { recursive: true });
const audioKey = `audio/${echo.id}/${voiceId}.mp3`;
await writeFile(join("content", audioKey), audio);

/**
 * Character timings into sentence timings.
 *
 * Walk the spoken text sentence by sentence, taking the start time of each sentence's
 * first character and the end time of its last.
 */
const alignment = result.alignment ?? result.normalized_alignment;
const starts = alignment?.character_start_times_seconds ?? [];
const ends = alignment?.character_end_times_seconds ?? [];
const totalS = ends.length > 0 ? ends[ends.length - 1] : 0;

let cursor = 0;
let lines = [];
let timingsTrusted = starts.length === spokenText.length;

if (!timingsTrusted) {
  // ElevenLabs normalises some text (numbers into words, for instance), so the alignment
  // can be longer than what we sent. Rather than silently mis-time every line, fall back
  // to proportional splitting and say so.
  console.warn(
    `  character count differs (sent ${spokenText.length}, aligned ${starts.length}) — ` +
      `timings are proportional, not measured. Check the transcript before shipping.`,
  );
}

for (const [i, spoken] of spokenSentences.entries()) {
  const from = cursor;
  const to = cursor + spoken.length - 1;
  cursor += spoken.length + 1; // +1 for the joining space

  const atS = timingsTrusted
    ? (starts[from] ?? 0)
    : (from / spokenText.length) * totalS;
  const endS = timingsTrusted
    ? (ends[Math.min(to, ends.length - 1)] ?? totalS)
    : (to / spokenText.length) * totalS;

  lines.push({
    text: displaySentences[i],
    atS: Number(atS.toFixed(2)),
    durationS: Number(Math.max(0.1, endS - atS).toFixed(2)),
  });
}

const durationS = Number(totalS.toFixed(1));

console.log(`\nWrote content/${audioKey} · ${(audio.length / 1024).toFixed(0)} KB · ${durationS}s`);
if (Math.abs(durationS - (echo.durationS ?? 0)) > 15) {
  console.log(
    `  note: the file declares durationS: ${echo.durationS}, the render is ${durationS}s. ` +
      `Update it — the scheduler packs against that number.`,
  );
}

console.log(`\nPaste into ${basename(echoPath)}:\n`);
console.log("renders:");
console.log(`  - voiceId: ${voiceId}`);
console.log(`    audioKey: ${audioKey}`);
console.log(`    durationS: ${durationS}`);
console.log(`    audioBytes: ${audio.length}`);
console.log(`    transcript:`);
console.log(`      totalS: ${durationS}`);
console.log(`      lines:`);
for (const line of lines) {
  console.log(`        - text: ${JSON.stringify(line.text)}`);
  console.log(`          atS: ${line.atS}`);
  console.log(`          durationS: ${line.durationS}`);
}

// Also drop it beside the audio, so nobody has to copy from a terminal.
await writeFile(
  join(outDir, `${voiceId}.render.json`),
  JSON.stringify({ voiceId, audioKey, durationS, audioBytes: audio.length, transcript: { totalS: durationS, lines } }, null, 2),
);
console.log(`\nAlso written to ${join(outDir, `${voiceId}.render.json`)}`);
