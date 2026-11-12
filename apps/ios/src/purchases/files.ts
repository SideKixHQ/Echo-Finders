/**
 * What the phone keeps about passes, in the documents directory:
 *
 *   purchases/store.json         the App Store entitlement last read, so a launch with no
 *                                signal (or a walk woken in the background) opens what was
 *                                paid for before StoreKit has answered
 *   purchases/week-cities.json   { transactionId: cityId } for each Week Pass bought here,
 *                                a second record of its place beside the transaction's own
 *                                token
 *   purchases/web.json           { customerId, entitlement } for passes bought on the
 *                                website, from "Bought on our website?"
 *   purchases/access.json        { role, code? } after a right Skeleton key
 *   purchases/heard.json         [echoId, ...]: the echoes heard, which the free ten count
 *
 * Read synchronously at start, like `prefs.ts`. A file that will not read is as if it were
 * not there. Removing the app removes these; StoreKit, the token and the website's receipt
 * are what bring passes back after that.
 */
import { Directory, File, Paths } from "expo-file-system";

const dir = () => new Directory(Paths.document, "purchases");

export type PurchaseFile = "store" | "week-cities" | "web" | "access" | "heard";

export function readJson(name: PurchaseFile): unknown {
  try {
    const file = new File(dir(), `${name}.json`);
    return file.exists ? (JSON.parse(file.textSync()) as unknown) : null;
  } catch {
    return null;
  }
}

/** Written beside and moved into place, so a crash mid write never leaves half a file. */
export function writeJson(name: PurchaseFile, value: unknown): void {
  try {
    const folder = dir();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const tmp = new File(folder, `${name}.json.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.writeSync(JSON.stringify(value));
    tmp.moveSync(new File(folder, `${name}.json`), { overwrite: true });
  } catch {
    /* Holds for this session; the App Store and the website can tell us again. */
  }
}

export function removeJson(name: PurchaseFile): void {
  try {
    const file = new File(dir(), `${name}.json`);
    if (file.exists) file.delete();
  } catch {
    /* Nothing to remove. */
  }
}
