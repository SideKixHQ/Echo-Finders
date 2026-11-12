/**
 * Small choices the app keeps across launches, in the documents directory:
 *
 *   prefs/sound.json   { soundOn }   the map's Sound control
 *
 * Read once at start, synchronously, so the narrator opens muted if it was left muted and
 * never says a word it should not. A file that will not read leaves the default (on).
 */
import { Directory, File, Paths } from "expo-file-system";
import { parseSound } from "./playback";

const dir = () => new Directory(Paths.document, "prefs");
const soundFile = () => new File(dir(), "sound.json");

export function readSoundOn(): boolean {
  try {
    const file = soundFile();
    return file.exists ? parseSound(JSON.parse(file.textSync()) as unknown) : true;
  } catch {
    return true;
  }
}

export function writeSoundOn(soundOn: boolean): void {
  try {
    const folder = dir();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const file = soundFile();
    // Written beside and moved into place, so a crash mid write never leaves half a file.
    const tmp = new File(folder, "sound.json.tmp");
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.writeSync(JSON.stringify({ soundOn }));
    tmp.moveSync(file, { overwrite: true });
  } catch {
    /* The control still holds for this session. */
  }
}
