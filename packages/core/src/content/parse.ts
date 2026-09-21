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

import type { Echo, EchoCategory, EchoFormat, Pronunciation, Source } from "../types.js";
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
    ...optional("audioKey", str("audioKey", false)),
    ...optional("renderedBy", str("renderedBy", false)),
    ...optional("pronunciations", pronunciationList(input["pronunciations"])),
    ...optional("remoteness", num("remoteness", false)),
    ...optional("tags", stringList(input["tags"])),
    ...optional("relatedIds", stringList(input["relatedIds"])),
    ...optional("perspectiveIds", stringList(input["perspectiveIds"])),
  };

  return { echo, issues };
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
