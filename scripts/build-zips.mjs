#!/usr/bin/env node
/**
 * `apps/prototype/public/zips.csv`: every US ZIP code's centre, for the map's search.
 *
 * Built from the US Census Bureau's ZCTA Gazetteer (ZIP Code Tabulation Areas), a US
 * Government work in the public domain:
 *
 *   https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip
 *
 * Unzip it and run `node scripts/build-zips.mjs 2025_Gaz_zcta_national.txt`. The point for
 * each ZIP is the Census "internal point" (INTPTLAT, INTPTLONG): the area's centre where that
 * falls inside it, otherwise the nearest point that does. It marks an area, not a building,
 * which is all a search that moves the map needs.
 *
 * The committed file (2025 vintage, 33,791 ZIPs) was cross-checked against two independent
 * builds of the same Gazetteer: every ZIP present in both, every point within 8 m.
 * Fetched by the app only when somebody opens the search, so it costs a first load nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , input] = process.argv;
if (!input) {
  console.error("usage: node scripts/build-zips.mjs <Gaz_zcta_national.txt>");
  process.exit(1);
}
const [head, ...lines] = readFileSync(input, "utf8").trim().split(/\r?\n/);
const cols = head.split("\t").map((c) => c.trim());
const at = (name) => cols.indexOf(name);
const [z, la, ln] = [at("GEOID"), at("INTPTLAT"), at("INTPTLONG")];
if (z < 0 || la < 0 || ln < 0) throw new Error("not a ZCTA Gazetteer file: " + cols.join(","));
const out = ["zip,lat,lng"];
for (const line of lines) {
  const f = line.split("\t").map((c) => c.trim());
  out.push(`${f[z]},${Number(f[la]).toFixed(4)},${Number(f[ln]).toFixed(4)}`);
}
writeFileSync(new URL("../apps/prototype/public/zips.csv", import.meta.url), out.join("\n") + "\n");
console.log(`wrote ${out.length - 1} ZIP codes`);
