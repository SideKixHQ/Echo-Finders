/**
 * A flight number, resolved to a route we have written.
 *
 * A stub, and labelled as one. Real lookup is a flight-data API: you send `UA 2314` and it
 * answers with today's origin, destination and filed track, because yesterday's UA 2314 is
 * not necessarily going where today's is. Until that exists this matches the handful of
 * flights the library covers.
 *
 * It lives in its own file because two screens need it. Onboarding asks for a flight number
 * on the way in, and the journey screen asks again every time after that, and a lookup that
 * behaved differently on the two doors would be the sort of bug nobody thinks to look for.
 *
 * Deliberately forgiving about spacing and case, because somebody is typing a code off a
 * boarding pass, on a phone, probably in a queue.
 */
const FLIGHT_ROUTES: Record<string, string> = {
  DL411: "jfk-mia",
  AA118: "jfk-mia",
  B6615: "jfk-mia",
  UA2314: "jfk-mia",
};

export const lookupFlight = (entered: string): string | null =>
  FLIGHT_ROUTES[entered.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? null;
