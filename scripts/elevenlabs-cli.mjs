/**
 * One way to reach ElevenLabs, shared by every script that needs it.
 *
 * WHY THIS EXISTS RATHER THAN `fetch` AND AN API KEY.
 *
 * Both scripts here used to read ELEVENLABS_API_KEY and call the REST API themselves,
 * which made a raw API key the only way in: find it, store it, keep it out of git, rotate
 * it when it leaked. And an ElevenLabs key is shown exactly once, at the moment you create
 * it, so "I made a key but there is no way to see it" is a dead end that costs a new key
 * every time somebody hits it.
 *
 * The CLI authenticates over OAuth and keeps the credential in the system keyring, so
 * there is nothing to find, paste, store or leak:
 *
 *   npx -y @elevenlabs/cli@1.7.1 auth login
 *
 * A key still works, because the CLI reads ELEVENLABS_API_KEY when one is set. That is
 * what CI or a container would use. The point is that it is now one option rather than
 * the only one.
 */

import { spawnSync } from "node:child_process";

/*
 * Pinned, not `@latest`. A render that silently picks up a new CLI on a Tuesday is a
 * render whose output nobody can explain, and `npx` fetches whatever is newest every time.
 * Override with ELEVENLABS_CLI to point at a locally installed binary instead.
 */
export const CLI = process.env.ELEVENLABS_CLI
  ? process.env.ELEVENLABS_CLI.split(" ")
  : ["npx", "-y", "@elevenlabs/cli@1.7.1"];

/**
 * Run one CLI command and return its parsed JSON, or exit with something a person can act
 * on.
 *
 * `input`, when given, is sent on stdin as the request body. That is how the long calls go:
 * a script is about a thousand characters and argument lists have a limit a long echo
 * would eventually find.
 *
 * maxBuffer is raised well past Node's 1 MB default on purpose. A text-to-speech reply is
 * the whole mp3 as base64, over a megabyte for a ninety-second echo, so the default would
 * fail on long echoes only — the worst kind of failure to go looking for.
 *
 * `allowFailure` returns null instead of exiting, for a caller working through a list
 * where one bad entry should not kill the run. Reading the narrators is exactly that: a
 * stale voice id in voices.yml is a known case, and the point of the script is to tell you
 * which ids are stale rather than to stop at the first one.
 */
export function callElevenLabs(args, { input, allowFailure = false } = {}) {
  const [cmd, ...cliArgs] = CLI;
  const run = spawnSync(cmd, [...cliArgs, ...args, "--format", "json"], {
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  const fail = (message) => {
    console.error(message);
    if (allowFailure) return null;
    process.exit(1);
  };

  if (run.error) {
    return fail(`Could not run the ElevenLabs CLI (${CLI.join(" ")}): ${run.error.message}`);
  }

  if (run.status !== 0) {
    const detail = run.stderr?.trim() || run.stdout?.trim() || "the ElevenLabs CLI failed";
    /*
     * The login hint only goes out on a hard stop. Printing it beside every stale voice id
     * in a list would train the reader to skip it, and it is the one line that matters
     * when it is true.
     */
    return fail(
      allowFailure
        ? detail
        : `${detail}\n\nIf that is an authentication error, run:\n` +
            `  ${CLI.join(" ")} auth login\n` +
            `It opens a browser and stores the credential in your keyring. There is no ` +
            `key to copy, and none needs to go in a file.`,
    );
  }

  try {
    return JSON.parse(run.stdout);
  } catch {
    return fail(`The ElevenLabs CLI did not return JSON:\n${run.stdout.slice(0, 500)}`);
  }
}
