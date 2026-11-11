/**
 * The small words on a My echoes row, worked out away from the screen so they can be tested.
 *
 *   shortPlace   "City Hall, Wilmington", never the full street address
 *   dayLabel     "Nov 3", US order, or "Today" and "Yesterday" where true
 *   isRareFind   rare or singular (`rarityOf`), the "Rare finds" tile and the row's tag
 *   placeOf      the place a person filters by: the city, else the region
 *
 * True crime is not exempt from rarity (James, 2026-11-11): it is a main category and earns
 * a rare find like any other echo, when its place earns it.
 */

import { cityAt, rarityOf, type Echo } from "@echofinders/core";

/** The last part of a place line that names a state or a country, not a town. */
const REGIONS = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York State", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington State", "West Virginia",
  "Wisconsin", "Wyoming", "D.C.", "DC", "USA", "United States",
  "England", "Scotland", "Wales", "Ireland", "United Kingdom", "UK",
]);

/**
 * The first part of the place and the town: "City Hall and Thalian Hall, 310 Chestnut
 * Street, Wilmington, North Carolina" is "City Hall and Thalian Hall, Wilmington". The
 * street, the neighbourhood and the state go; a row has three lines, and the address is on
 * the card.
 */
export function shortPlace(place: string): string {
  const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && REGIONS.has(parts[parts.length - 1]!)) parts.pop();
  const first = parts[0] ?? place.trim();
  if (parts.length < 2) return first;
  const town = parts[parts.length - 1]!;
  // "Boston Common, Boston" says the town twice, and that is fine; "Charleston, Charleston" is not.
  return first === town ? first : `${first}, ${town}`;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today", "Yesterday", "Nov 3", or "Nov 3, 2025" from another year. Local time, US order. */
export function dayLabel(when: Date, now: Date = new Date()): string {
  if (sameDay(when, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(when, yesterday)) return "Yesterday";
  return when.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** A rare find: rare or singular. Hard to reach: far off the walk, open some hours, or inside. */
export function isRareFind(echo: Echo): boolean {
  const rarity = rarityOf(echo);
  return rarity === "rare" || rarity === "singular";
}

/** How many rare finds a list holds. */
export function rareFindCount(echoes: readonly Echo[]): number {
  return echoes.filter(isRareFind).length;
}

/** "1 min", "4 min": how long it plays, rounded, never under a minute. */
export function minutesLabel(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * Where an echo is, as a place a person would filter by.
 *
 * The city it falls in (the same areas a City Pass covers, so the filter and what a pass
 * opens always agree), else the last part of its place line: "Blue Ridge Parkway,
 * Virginia" files under Virginia. New cities need no change here.
 */
export function placeOf(echo: Echo): string {
  const city = cityAt(echo.point.at);
  if (city) return city.name;
  const parts = echo.point.place.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? echo.point.place;
}
