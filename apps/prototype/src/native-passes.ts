/**
 * Passes from two places as one, for the iPhone app (`native-bridge.ts`): what the page
 * keeps (a website purchase, or one recorded on this phone) and what the App Store holds.
 * Its own file, importing only the engine, so the root suite can hold it to the iPhone
 * app's own sum.
 */
import { FREE, type Entitlement } from "@echofinders/core";

/**
 * Two records as one: every city, the latest end of each Week Pass, the year that runs
 * longest. The same sum as the iPhone app's `mergeEntitlements`
 * (`apps/ios/src/purchases/entitlement.ts`), which `test/ios/shell.test.ts` holds it to.
 */
export function mergePasses(a: Entitlement, b: Entitlement): Entitlement {
  const paid = [a, b].filter((e) => e.kind !== "free");
  if (paid.length === 0) return FREE;
  if (paid.length === 1) return paid[0]!;
  const firsts = paid.map((e) => e.purchasedAt).filter((n): n is number => typeof n === "number");
  const at = firsts.length ? { purchasedAt: Math.min(...firsts) } : {};
  if (paid.some((e) => e.kind === "unlocked")) return { kind: "unlocked", ...at };
  const cities = [...new Set(paid.flatMap((e) => e.cities ?? []))].sort();
  const weekUntil = new Map<string, number>();
  for (const w of paid.flatMap((e) => e.weekPasses ?? [])) weekUntil.set(w.city, Math.max(w.until, weekUntil.get(w.city) ?? 0));
  const weekPasses = [...weekUntil].sort(([x], [y]) => x.localeCompare(y)).map(([city, until]) => ({ city, until }));
  const year = paid
    .filter((e) => e.allAccessUntil !== undefined)
    .sort((x, y) => (y.allAccessUntil ?? 0) - (x.allAccessUntil ?? 0))[0];
  return {
    kind: "passes",
    ...at,
    ...(cities.length ? { cities } : {}),
    ...(weekPasses.length ? { weekPasses } : {}),
    ...(year ? { allAccessUntil: year.allAccessUntil! } : {}),
    ...(year && year.renews === false ? { renews: false } : {}),
  };
}
