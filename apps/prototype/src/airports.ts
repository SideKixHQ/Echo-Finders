/**
 * Airports, so a flight can be described without asking an API what a flight number means.
 *
 * The flight number was never the thing we needed. What builds a journey is an origin and a
 * destination: `buildRouteGeometry` takes two waypoints and interpolates the great circle
 * itself, so two airports is a complete answer and a flight-data subscription is an
 * expensive way of converting one question into another one.
 *
 * There is a deeper reason too. **The unit of this product is the city pair, not the
 * flight.** We write echoes for the corridor between New York and Miami; somebody flying it
 * on Delta, American or JetBlue gets the same echoes on the same stretch of coast. Asking
 * for a flight number asks a harder question than the one we need answered, and then charges
 * for the privilege.
 *
 * **This list is a start, not the set.** Fifty-odd of the busiest, hand-entered, which is
 * enough to fly most of the pairs anybody will try and small enough to ship in the bundle,
 * where it works on a plane with the wifi off. The real version is the OurAirports dataset,
 * which is public domain and about five thousand commercial fields; it is a build step and a
 * licence read rather than a design decision, so it is not in the way of anything.
 *
 * Coordinates are the field reference point, good to a few hundred metres, which is a rounding
 * error against a route measured in thousands of kilometres.
 */

export interface Airport {
  readonly code: string;
  readonly name: string;
  readonly city: string;
  readonly lat: number;
  readonly lng: number;
  readonly timeZone: string;
}

export const AIRPORTS: readonly Airport[] = [
  { code: "JFK", name: "John F. Kennedy International", city: "New York", lat: 40.6413, lng: -73.7781, timeZone: "America/New_York" },
  { code: "LGA", name: "LaGuardia", city: "New York", lat: 40.7769, lng: -73.874, timeZone: "America/New_York" },
  { code: "EWR", name: "Newark Liberty International", city: "Newark", lat: 40.6895, lng: -74.1745, timeZone: "America/New_York" },
  { code: "MIA", name: "Miami International", city: "Miami", lat: 25.7959, lng: -80.287, timeZone: "America/New_York" },
  { code: "FLL", name: "Fort Lauderdale Hollywood International", city: "Fort Lauderdale", lat: 26.0742, lng: -80.1506, timeZone: "America/New_York" },
  { code: "MCO", name: "Orlando International", city: "Orlando", lat: 28.4312, lng: -81.3081, timeZone: "America/New_York" },
  { code: "TPA", name: "Tampa International", city: "Tampa", lat: 27.9755, lng: -82.5332, timeZone: "America/New_York" },
  { code: "ATL", name: "Hartsfield Jackson Atlanta International", city: "Atlanta", lat: 33.6407, lng: -84.4277, timeZone: "America/New_York" },
  { code: "CLT", name: "Charlotte Douglas International", city: "Charlotte", lat: 35.214, lng: -80.9431, timeZone: "America/New_York" },
  { code: "RDU", name: "Raleigh Durham International", city: "Raleigh", lat: 35.8801, lng: -78.7880, timeZone: "America/New_York" },
  { code: "DCA", name: "Ronald Reagan Washington National", city: "Washington", lat: 38.8512, lng: -77.0402, timeZone: "America/New_York" },
  { code: "IAD", name: "Washington Dulles International", city: "Washington", lat: 38.9531, lng: -77.4565, timeZone: "America/New_York" },
  { code: "BWI", name: "Baltimore Washington International", city: "Baltimore", lat: 39.1774, lng: -76.6684, timeZone: "America/New_York" },
  { code: "PHL", name: "Philadelphia International", city: "Philadelphia", lat: 39.8719, lng: -75.2411, timeZone: "America/New_York" },
  { code: "BOS", name: "Logan International", city: "Boston", lat: 42.3656, lng: -71.0096, timeZone: "America/New_York" },
  { code: "ORD", name: "O'Hare International", city: "Chicago", lat: 41.9742, lng: -87.9073, timeZone: "America/Chicago" },
  { code: "MDW", name: "Midway International", city: "Chicago", lat: 41.7868, lng: -87.7522, timeZone: "America/Chicago" },
  { code: "DTW", name: "Detroit Metropolitan Wayne County", city: "Detroit", lat: 42.2162, lng: -83.3554, timeZone: "America/Detroit" },
  { code: "MSP", name: "Minneapolis Saint Paul International", city: "Minneapolis", lat: 44.8848, lng: -93.2223, timeZone: "America/Chicago" },
  { code: "DFW", name: "Dallas Fort Worth International", city: "Dallas", lat: 32.8998, lng: -97.0403, timeZone: "America/Chicago" },
  { code: "IAH", name: "George Bush Intercontinental", city: "Houston", lat: 29.9902, lng: -95.3368, timeZone: "America/Chicago" },
  { code: "AUS", name: "Austin Bergstrom International", city: "Austin", lat: 30.1975, lng: -97.6664, timeZone: "America/Chicago" },
  { code: "NNA", name: "Nashville International", city: "Nashville", lat: 36.1245, lng: -86.6782, timeZone: "America/Chicago" },
  { code: "MSY", name: "Louis Armstrong New Orleans International", city: "New Orleans", lat: 29.9934, lng: -90.258, timeZone: "America/Chicago" },
  { code: "DEN", name: "Denver International", city: "Denver", lat: 39.8561, lng: -104.6737, timeZone: "America/Denver" },
  { code: "PHX", name: "Phoenix Sky Harbor International", city: "Phoenix", lat: 33.4343, lng: -112.0116, timeZone: "America/Phoenix" },
  { code: "LAS", name: "Harry Reid International", city: "Las Vegas", lat: 36.084, lng: -115.1537, timeZone: "America/Los_Angeles" },
  { code: "SLC", name: "Salt Lake City International", city: "Salt Lake City", lat: 40.7899, lng: -111.9791, timeZone: "America/Denver" },
  { code: "LAX", name: "Los Angeles International", city: "Los Angeles", lat: 33.9416, lng: -118.4085, timeZone: "America/Los_Angeles" },
  { code: "SAN", name: "San Diego International", city: "San Diego", lat: 32.7338, lng: -117.1933, timeZone: "America/Los_Angeles" },
  { code: "SFO", name: "San Francisco International", city: "San Francisco", lat: 37.6213, lng: -122.379, timeZone: "America/Los_Angeles" },
  { code: "OAK", name: "Oakland International", city: "Oakland", lat: 37.7213, lng: -122.2207, timeZone: "America/Los_Angeles" },
  { code: "SJC", name: "Norman Y. Mineta San Jose International", city: "San Jose", lat: 37.3639, lng: -121.9289, timeZone: "America/Los_Angeles" },
  { code: "SEA", name: "Seattle Tacoma International", city: "Seattle", lat: 47.4502, lng: -122.3088, timeZone: "America/Los_Angeles" },
  { code: "PDX", name: "Portland International", city: "Portland", lat: 45.5898, lng: -122.5951, timeZone: "America/Los_Angeles" },
  { code: "YYZ", name: "Toronto Pearson International", city: "Toronto", lat: 43.6777, lng: -79.6248, timeZone: "America/Toronto" },
  { code: "YVR", name: "Vancouver International", city: "Vancouver", lat: 49.1967, lng: -123.1815, timeZone: "America/Vancouver" },
  { code: "YUL", name: "Montreal Trudeau International", city: "Montreal", lat: 45.4706, lng: -73.7408, timeZone: "America/Toronto" },
  { code: "MEX", name: "Mexico City International", city: "Mexico City", lat: 19.4363, lng: -99.0721, timeZone: "America/Mexico_City" },
  { code: "LHR", name: "Heathrow", city: "London", lat: 51.47, lng: -0.4543, timeZone: "Europe/London" },
  { code: "LGW", name: "Gatwick", city: "London", lat: 51.1537, lng: -0.1821, timeZone: "Europe/London" },
  { code: "MAN", name: "Manchester", city: "Manchester", lat: 53.3537, lng: -2.275, timeZone: "Europe/London" },
  { code: "EDI", name: "Edinburgh", city: "Edinburgh", lat: 55.95, lng: -3.3725, timeZone: "Europe/London" },
  { code: "DUB", name: "Dublin", city: "Dublin", lat: 53.4213, lng: -6.2701, timeZone: "Europe/Dublin" },
  { code: "CDG", name: "Charles de Gaulle", city: "Paris", lat: 49.0097, lng: 2.5479, timeZone: "Europe/Paris" },
  { code: "AMS", name: "Schiphol", city: "Amsterdam", lat: 52.3105, lng: 4.7683, timeZone: "Europe/Amsterdam" },
  { code: "FRA", name: "Frankfurt", city: "Frankfurt", lat: 50.0379, lng: 8.5622, timeZone: "Europe/Berlin" },
  { code: "MUC", name: "Munich", city: "Munich", lat: 48.3537, lng: 11.775, timeZone: "Europe/Berlin" },
  { code: "MAD", name: "Adolfo Suarez Madrid Barajas", city: "Madrid", lat: 40.4719, lng: -3.5626, timeZone: "Europe/Madrid" },
  { code: "BCN", name: "Josep Tarradellas Barcelona El Prat", city: "Barcelona", lat: 41.2974, lng: 2.0833, timeZone: "Europe/Madrid" },
  { code: "FCO", name: "Leonardo da Vinci Fiumicino", city: "Rome", lat: 41.8003, lng: 12.2389, timeZone: "Europe/Rome" },
  { code: "LIS", name: "Humberto Delgado", city: "Lisbon", lat: 38.7756, lng: -9.1354, timeZone: "Europe/Lisbon" },
  { code: "KEF", name: "Keflavik International", city: "Reykjavik", lat: 63.985, lng: -22.6056, timeZone: "Atlantic/Reykjavik" },
  { code: "DXB", name: "Dubai International", city: "Dubai", lat: 25.2532, lng: 55.3657, timeZone: "Asia/Dubai" },
  { code: "SIN", name: "Changi", city: "Singapore", lat: 1.3644, lng: 103.9915, timeZone: "Asia/Singapore" },
  { code: "HND", name: "Haneda", city: "Tokyo", lat: 35.5494, lng: 139.7798, timeZone: "Asia/Tokyo" },
  { code: "NRT", name: "Narita International", city: "Tokyo", lat: 35.772, lng: 140.3929, timeZone: "Asia/Tokyo" },
  { code: "SYD", name: "Kingsford Smith", city: "Sydney", lat: -33.9399, lng: 151.1753, timeZone: "Australia/Sydney" },
  { code: "AKL", name: "Auckland", city: "Auckland", lat: -37.0082, lng: 174.7850, timeZone: "Pacific/Auckland" },
];

/**
 * Find an airport by anything somebody would type.
 *
 * Code, city or name, because a person holds "Heathrow", "London" and "LHR" as the same
 * fact and should not have to guess which one we wanted. Codes rank first, so typing "LGA"
 * does not hand you a list of everything in Los Angeles.
 */
export function searchAirports(query: string, limit = 6): Airport[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const scored: { airport: Airport; rank: number }[] = [];
  for (const airport of AIRPORTS) {
    const code = airport.code.toLowerCase();
    const city = airport.city.toLowerCase();
    const name = airport.name.toLowerCase();
    if (code === q) scored.push({ airport, rank: 0 });
    else if (code.startsWith(q)) scored.push({ airport, rank: 1 });
    else if (city.startsWith(q)) scored.push({ airport, rank: 2 });
    else if (name.startsWith(q)) scored.push({ airport, rank: 3 });
    else if (city.includes(q) || name.includes(q)) scored.push({ airport, rank: 4 });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.airport.code.localeCompare(b.airport.code))
    .slice(0, limit)
    .map((s) => s.airport);
}
