/**
 * The things a pack can be of, found by id: cities from the engine, routes from the same
 * generated library the echoes come from (`library.ts` explains why it is imported in
 * place). Kept apart from `plan.ts` so that stays free of the library and testable.
 */
import { CITIES, type Route } from "@echofinders/core";
import { currentRoutes } from "../library";
import type { PackManifest, PackSource } from "./plan";

/** Every route the phone knows: the site's, as last fetched, and the built in ones (`library.ts`). */
export function allRoutes(): readonly Route[] {
  return currentRoutes();
}

export function routeById(id: string | undefined): Route | undefined {
  return id ? currentRoutes().find((r) => r.id === id) : undefined;
}

/**
 * What a saved pack was made from, so it can be planned again for an update. An area is
 * not in any list yet, so an area pack keeps what it has until one is.
 */
export function sourceOf(manifest: PackManifest): PackSource | null {
  if (manifest.kind === "city") {
    const city = CITIES.find((c) => c.id === manifest.sourceId);
    return city ? { kind: "city", city } : null;
  }
  if (manifest.kind === "route") {
    const route = routeById(manifest.sourceId);
    return route ? { kind: "route", route } : null;
  }
  return null;
}
