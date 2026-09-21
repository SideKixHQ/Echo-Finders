/**
 * How hard is it to stand here?
 *
 * Every input is a fact about the world rather than a dial: how precisely you must place
 * yourself, whether the place is reachable at all hours, and how far it is from anywhere
 * many people go. Nothing here is tunable for pacing, deliberately — the moment rarity is
 * assigned rather than earned, a collection of places you stood stops meaning anything.
 */

import type { Echo } from "../types.js";
import type { Rarity } from "./types.js";

/** Radii at or below which finding the exact spot is itself the difficulty. */
const PRECISE_KM = 0.05;
const FAIRLY_PRECISE_KM = 0.15;

/** Remoteness above which few people will ever pass by. */
const REMOTE = 0.7;
const OFF_THE_BEATEN_TRACK = 0.4;

export function rarityOf(echo: Echo): Rarity {
  let difficulty = 0;

  // Precision: a doorway you have to find, versus a city you cannot miss.
  if (echo.point.triggerRadiusKm <= PRECISE_KM) difficulty += 2;
  else if (echo.point.triggerRadiusKm <= FAIRLY_PRECISE_KM) difficulty += 1;

  // Availability: an echo you can only open after dark, or in one season.
  if (echo.hours) difficulty += 1;

  // Remoteness: how far from anywhere many people go.
  const remoteness = echo.remoteness ?? 0;
  if (remoteness >= REMOTE) difficulty += 2;
  else if (remoteness >= OFF_THE_BEATEN_TRACK) difficulty += 1;

  if (difficulty >= 4) return "singular";
  if (difficulty >= 3) return "rare";
  if (difficulty >= 1) return "uncommon";
  return "common";
}

/** Human-readable reason an echo is hard to reach, for the collection screen. */
export function rarityReasons(echo: Echo): string[] {
  const reasons: string[] = [];

  if (echo.point.triggerRadiusKm <= PRECISE_KM) {
    reasons.push("You have to find the exact spot");
  } else if (echo.point.triggerRadiusKm <= FAIRLY_PRECISE_KM) {
    reasons.push("You have to be close");
  }
  if (echo.hours) reasons.push("Only open at certain hours");

  const remoteness = echo.remoteness ?? 0;
  if (remoteness >= REMOTE) reasons.push("A long way from anywhere");
  else if (remoteness >= OFF_THE_BEATEN_TRACK) reasons.push("Off the beaten track");

  return reasons;
}
