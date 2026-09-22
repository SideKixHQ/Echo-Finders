/**
 * Turning an authored content file into an `Echo`.
 *
 * Content files are flatter than the domain model on purpose. An author writing about a
 * doorway should say `at` and `triggerRadiusKm`, not construct a nested `point`; the
 * grouping that makes the code clearer makes the file fussier, and the file is the thing
 * a person edits every day.
 *
 * Pure, so the whole pipeline is testable without touching a disk: whoever reads the files
 * and parses the YAML hands the result here.
 */

import type {
  ArchivePhoto,
  Attraction,
  AudioRender,
  Echo,
  EchoCategory,
  EchoFormat,
  Pronunciation,
  Source,
  TrueCrimeReview,
} from "../types.js";
import { ECHO_CATEGORIES, NOMINAL_DURATION_S } from "../types.js";
import type { ValidationIssue } from "./validate.js";

export interface ParseResult {
  readonly echo: Echo | null;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Parse one authored record.
 *
 * Reports every structural problem it finds rather than throwing on the first, because an
 * editor fixing a file wants the whole list, not a game of whack-a-mole.
 */
export function parseEcho(input: unknown, fileHint = "<unknown>"): ParseResult {
  const issues: ValidationIssue[] = [];
  const id = isRecord(input) && typeof input["id"] === "string" ? input["id"] : fileHint;

  const fail = (field: string, message: string) => {
    issues.push({ echoId: id, severity: "error", field, message });
  };

  if (!isRecord(input)) {
    fail("<file>", "is not a mapping — the file should contain one echo at the top level");
    return { echo: null, issues };
  }

  const str = (key: string, required = true): string | undefined => {
    const value = input[key];
    if (value === undefined || value === null) {
      if (required) fail(key, "is required");
      return undefined;
    }
    if (typeof value !== "string") {
      fail(key, `should be text, not ${typeof value}`);
      return undefined;
    }
    return value;
  };

  const num = (key: string, required = true): number | undefined => {
    const value = input[key];
    if (value === undefined || value === null) {
      if (required) fail(key, "is required");
      return undefined;
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      fail(key, `should be a number, not ${typeof value}`);
      return undefined;
    }
    return value;
  };

  const at = input["at"];
  let lat: number | undefined;
  let lng: number | undefined;
  if (!isRecord(at)) {
    fail("at", "is required, as { lat, lng }");
  } else {
    lat = typeof at["lat"] === "number" ? at["lat"] : undefined;
    lng = typeof at["lng"] === "number" ? at["lng"] : undefined;
    if (lat === undefined) fail("at.lat", "is required and must be a number");
    if (lng === undefined) fail("at.lng", "is required and must be a number");
  }

  const category = str("category") as EchoCategory | undefined;
  if (category !== undefined && !ECHO_CATEGORIES.includes(category)) {
    fail("category", `"${category}" is not a known category`);
  }

  const format = (str("format", false) ?? "short") as EchoFormat;
  if (!(format in NOMINAL_DURATION_S)) {
    fail("format", `"${format}" is not a known format`);
  }

  const sourcesInput = input["sources"];
  const sources: Source[] = [];
  if (!Array.isArray(sourcesInput)) {
    fail("sources", "is required, as a list");
  } else {
    sourcesInput.forEach((raw, i) => {
      if (!isRecord(raw)) {
        fail(`sources[${i}]`, "should be a mapping");
        return;
      }
      const title = raw["title"];
      const publisher = raw["publisher"];
      const retrievedAt = raw["retrievedAt"];
      const rights = raw["rights"];
      if (typeof title !== "string" || typeof publisher !== "string") {
        fail(`sources[${i}]`, "needs a title and a publisher");
        return;
      }
      if (typeof retrievedAt !== "string") {
        fail(`sources[${i}].retrievedAt`, "is required — sources move and vanish");
        return;
      }
      sources.push({
        title,
        publisher,
        retrievedAt,
        rights: rights as Source["rights"],
        ...(typeof raw["url"] === "string" ? { url: raw["url"] } : {}),
      });
    });
  }

  const review = parseTrueCrimeReview(input["trueCrimeReview"], fail);
  const archive = archivePhotos(input["archive"], fail);
  const attraction = attractionOf(input["attraction"], fail);

  const durationS = num("durationS", false) ?? NOMINAL_DURATION_S[format] ?? 90;
  const triggerRadiusKm = num("triggerRadiusKm");
  const title = str("title");
  const summary = str("summary");
  const place = str("place");
  const quality = num("quality", false) ?? 0.7;
  const minAge = num("minAge", false) ?? 0;

  if (issues.length > 0) return { echo: null, issues };

  const echo: Echo = {
    id,
    title: title!,
    summary: summary!,
    point: { at: { lat: lat!, lng: lng! }, triggerRadiusKm: triggerRadiusKm!, place: place! },
    category: category!,
    format,
    durationS,
    minAge,
    quality,
    visibility: (str("visibility", false) ?? "position-only") as Echo["visibility"],
    certainty: (str("certainty", false) ?? "documented") as Echo["certainty"],
    sources,
    // Both default to the cautious value: an unmarked file is a draft whose facts nobody
    // has checked. Publishing has to be something a person did on purpose.
    editorial: (str("editorial", false) ?? "draft") as Echo["editorial"],
    factCheck: (str("factCheck", false) ?? "unchecked") as Echo["factCheck"],
    ...optional("script", str("script", false)),
    ...optional("teaser", str("teaser", false)),
    ...optional("detail", str("detail", false)),
    ...optional("certaintyNote", str("certaintyNote", false)),
    ...optional("voice", str("voice", false)),
    ...optional("renders", renderList(input["renders"], durationS)),
    ...optional("pronunciations", pronunciationList(input["pronunciations"])),
    ...optional("remoteness", num("remoteness", false)),
    ...optional("tags", stringList(input["tags"])),
    ...optional("relatedIds", stringList(input["relatedIds"])),
    ...optional("perspectiveIds", stringList(input["perspectiveIds"])),
    ...optional("archive", archive),
    ...optional("attraction", attraction),
    ...optional("trueCrimeReview", review),
    ...optional("simple", simpleVariant(input["simple"], fail)),
  };

  return { echo, issues };
}

/**
 * The plainer, shorter telling.
 *
 * Silently skipped when malformed rather than failing the file, unlike the true-crime
 * review: a missing simple cut means a listener gets the full telling, which is a quality
 * gap for an editor to notice — not a reason to refuse to publish an otherwise sound echo.
 */
function simpleVariant(
  input: unknown,
  fail: (field: string, message: string) => void,
): Echo["simple"] {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    fail("simple", "should be a mapping with title, durationS and script");
    return undefined;
  }
  const { title, durationS, script } = input;
  if (typeof title !== "string" || typeof durationS !== "number" || typeof script !== "string") {
    fail("simple", "needs title (text), durationS (number) and script (text)");
    return undefined;
  }
  return { title, durationS, script };
}

/**
 * The editorial sign-off on a true-crime echo.
 *
 * Unlike every other optional field here, a malformed one is an **error** rather than a
 * silent skip. Dropping it quietly is how this field spent its whole life unparsed: the
 * validator would report `trueCrimeReview is mandatory for true crime` about a file that
 * plainly contained one, and the only way to find out why was to read the parser. A field
 * whose entire job is to prove a human looked at something must never go missing without
 * saying so.
 *
 * The values are not interpreted, only shaped. Whether `convictionStatus` is *correct* is
 * exactly the judgement a named human is signing their name against, and no parser can
 * check it.
 */
function parseTrueCrimeReview(
  input: unknown,
  fail: (field: string, message: string) => void,
): TrueCrimeReview | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    fail("trueCrimeReview", "should be a mapping of the review fields");
    return undefined;
  }

  const statuses = ["convicted", "alleged", "unsolved", "exonerated"] as const;
  const status = input["convictionStatus"];
  const involves = input["involvesLivingPeople"];
  const reviewedBy = input["reviewedBy"];
  const reviewedAt = input["reviewedAt"];
  const contentWarning = input["contentWarning"];

  let ok = true;
  const require = (field: string, value: unknown, expected: string) => {
    if (typeof value !== expected) {
      fail(`trueCrimeReview.${field}`, `is required, as ${expected}`);
      ok = false;
    }
  };
  require("involvesLivingPeople", involves, "boolean");
  require("reviewedBy", reviewedBy, "string");
  require("reviewedAt", reviewedAt, "string");
  require("contentWarning", contentWarning, "string");

  if (!statuses.includes(status as (typeof statuses)[number])) {
    fail(
      "trueCrimeReview.convictionStatus",
      `must be one of ${statuses.join(", ")} — stating the wrong one is defamation`,
    );
    ok = false;
  }
  if (!ok) return undefined;

  return {
    involvesLivingPeople: involves as boolean,
    convictionStatus: status as TrueCrimeReview["convictionStatus"],
    reviewedBy: reviewedBy as string,
    reviewedAt: reviewedAt as string,
    contentWarning: contentWarning as string,
  };
}

/**
 * Archive photographs, for standing where the photographer stood.
 *
 * Errors rather than silent skips, for two separate reasons. The first is the one that has
 * now bitten this parser three times: a field declared on `Echo` that nothing here reads is
 * indistinguishable from a field an author got wrong, and the only way anybody finds out is
 * by reading the parser. The second is specific to images — `credit` is not decoration. An
 * archive plate belongs to an institution, showing it without the credit is the thing they
 * asked us not to do, and a parser that quietly drops a malformed entry turns a licensing
 * obligation into a missing feature nobody notices.
 *
 * `at` and `bearingDeg` stay optional because a photograph with neither is still worth
 * showing next to the place it was taken of. Everything downstream degrades (see
 * `alignmentTo`): no vantage falls back to the echo's own point, no bearing drops the
 * facing advice and keeps the distance.
 */
function archivePhotos(
  input: unknown,
  fail: (field: string, message: string) => void,
): readonly ArchivePhoto[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) {
    fail("archive", "should be a list of photographs");
    return undefined;
  }

  const photos: ArchivePhoto[] = [];
  input.forEach((raw, i) => {
    const where = `archive[${i}]`;
    if (!isRecord(raw)) {
      fail(where, "should be a mapping");
      return;
    }
    const imageKey = raw["imageKey"];
    const credit = raw["credit"];
    const rights = raw["rights"];
    if (typeof imageKey !== "string") {
      fail(`${where}.imageKey`, "is required, as text");
      return;
    }
    if (typeof credit !== "string" || credit.trim() === "") {
      fail(`${where}.credit`, "is required — an archive image is shown with its credit or not at all");
      return;
    }
    if (typeof rights !== "string") {
      fail(`${where}.rights`, "is required — we have to know what we are allowed to show");
      return;
    }

    const at = raw["at"];
    let vantage: { lat: number; lng: number } | undefined;
    if (at !== undefined && at !== null) {
      if (!isRecord(at) || typeof at["lat"] !== "number" || typeof at["lng"] !== "number") {
        fail(`${where}.at`, "should be { lat, lng } — where the photographer stood");
        return;
      }
      vantage = { lat: at["lat"], lng: at["lng"] };
    }

    const bearing = raw["bearingDeg"];
    if (bearing !== undefined && bearing !== null) {
      if (typeof bearing !== "number" || Number.isNaN(bearing)) {
        fail(`${where}.bearingDeg`, "should be a number, degrees clockwise from north");
        return;
      }
      // Out of range is far more likely to be a typo than an intention, and a bearing of
      // 450 sends somebody confidently the wrong way rather than failing visibly.
      if (bearing < 0 || bearing >= 360) {
        fail(`${where}.bearingDeg`, "should be 0–359, degrees clockwise from north");
        return;
      }
    }

    const year = raw["year"];
    if (year !== undefined && year !== null && typeof year !== "number") {
      fail(`${where}.year`, "should be a number");
      return;
    }

    photos.push({
      imageKey,
      credit,
      rights: rights as Source["rights"],
      ...optional("at", vantage),
      ...(typeof bearing === "number" ? { bearingDeg: bearing } : {}),
      ...(typeof year === "number" ? { year } : {}),
      ...(typeof raw["caption"] === "string" ? { caption: raw["caption"] } : {}),
    });
  });

  return photos.length > 0 ? photos : undefined;
}

/**
 * A place a passenger can actually go (ADR-0004).
 *
 * An error rather than a skip for the same reason as the review: save-for-later is a
 * promise made on the strength of this field, and an echo that silently lost its attraction
 * offers a button that goes nowhere.
 */
function attractionOf(
  input: unknown,
  fail: (field: string, message: string) => void,
): Attraction | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    fail("attraction", "should be a mapping with a name and a position");
    return undefined;
  }
  const name = input["name"];
  const at = input["at"];
  if (typeof name !== "string" || name.trim() === "") {
    fail("attraction.name", "is required, as text");
    return undefined;
  }
  if (!isRecord(at) || typeof at["lat"] !== "number" || typeof at["lng"] !== "number") {
    fail("attraction.at", "is required, as { lat, lng }");
    return undefined;
  }
  const rating = input["rating"];
  if (rating !== undefined && rating !== null && typeof rating !== "number") {
    fail("attraction.rating", "should be a number");
    return undefined;
  }
  return {
    name,
    at: { lat: at["lat"], lng: at["lng"] },
    ...(typeof input["googlePlaceId"] === "string"
      ? { googlePlaceId: input["googlePlaceId"] }
      : {}),
    ...(typeof rating === "number" ? { rating } : {}),
    ...(typeof input["url"] === "string" ? { url: input["url"] } : {}),
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/**
 * Pronunciation notes.
 *
 * Silently skips malformed entries rather than failing the file. A missing note means a
 * narrator says a place name the ordinary way, which is a quality problem for an editor to
 * notice — not a reason to refuse to publish an otherwise sound echo.
 */
/**
 * Audio renders, one per narrator.
 *
 * A render with no explicit duration inherits the echo's, which is right for the first
 * voice and approximate for later ones — the real figure lands when the audio is rendered.
 */
function renderList(value: unknown, fallbackDurationS: number): AudioRender[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list: AudioRender[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const voiceId = raw["voiceId"];
    const audioKey = raw["audioKey"];
    if (typeof voiceId !== "string" || typeof audioKey !== "string") continue;
    list.push({
      voiceId,
      audioKey,
      durationS: typeof raw["durationS"] === "number" ? raw["durationS"] : fallbackDurationS,
      ...(typeof raw["audioBytes"] === "number" ? { audioBytes: raw["audioBytes"] } : {}),
    });
  }
  return list.length > 0 ? list : undefined;
}

function pronunciationList(value: unknown): Pronunciation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list: Pronunciation[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const written = raw["written"];
    const say = raw["say"];
    if (typeof written !== "string" || typeof say !== "string") continue;
    list.push({
      written,
      say,
      ...(typeof raw["ipa"] === "string" ? { ipa: raw["ipa"] } : {}),
    });
  }
  return list.length > 0 ? list : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
