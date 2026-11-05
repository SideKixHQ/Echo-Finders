# The cities

*Echo Finders is a Whatishere.com product.*

James (2026-10-14): "Lets do every city you named even all the secondary ones", then, for the
more cities, resort towns, historic towns, national parks and scenic drives that followed, "I think
we need to do all of these." This is the launch list for blocker #0 in `10-blockers.md`.

**A city, town or park is covered at 30 approved echoes** (a city's in its walkable core, a
park's along the roads and trails most visitors use). **A drive is covered at one approved echo
every 10 miles.** Approved means reviewed by
James (`writing-echoes.md`), fact-checked against sources, and true crime carrying its
disclaimer. Each city also needs its streets and map built (`build-streets.py`,
`build-map.py`, ADR-0019) before it is drawn properly.

## The MVP: 18 places, in three tiers (James, 2026-11-05)

James (2026-11-05): "wilmington, carolina beach, wrightsville beach for sure. Then NYC, DC,
Philly, Chicago, Boston, Houston", then, after the research in `13-story-mix.md`, "go with
San Antonio". The small towns follow his question about places like Tombstone. Everything
else on this page waits until these are covered.

Each place gets the walking mix in `13-story-mix.md` (30 echoes), leaning where its story
does. **The four small towns in Tier 3 are covered at 20** (James, 2026-11-05: "20 for small
towns"), with the same mix scaled by two thirds. Counts are echoes in `content/echoes/` on
2026-11-05.

### Tier 1: home, and the ghost cities

| # | Place | Echoes now | Lean |
|---|---|---|---|
| M1 | Wilmington, NC | 105 drafted, 16 approved with real audio | history and true crime (1898) |
| M2 | Carolina Beach, NC | 0 | beach-town history, people |
| M3 | Kure Beach and Fort Fisher, NC | 0 | military (the 1865 battle for Fort Fisher) |
| M4 | Wrightsville Beach, NC | 0 | beach-town history, built |
| M5 | Southport, NC | 0 | ghosts, film locations |
| M6 | Savannah, GA | 30 drafted | ghost-heavy (1 ghost story now) |
| M7 | Charleston, SC | 30 drafted | ghost-heavy (none now) |
| M8 | New Orleans, LA | 30 drafted | ghost-heavy, food |

### Tier 2: the big walkable cities

| # | Place | Echoes now | Lean |
|---|---|---|---|
| M9 | New York | 16 drafted | true crime |
| M10 | Washington, DC | 37 drafted | history, military |
| M11 | Philadelphia | 31 drafted | history (the Revolution) |
| M12 | Boston | 31 drafted | history, military |
| M13 | Chicago | 2 drafted | true crime (Prohibition), built (architecture) |

### Tier 3: small towns with one big story

| # | Place | Covered at | Echoes now | Lean |
|---|---|---|---|---|
| M14 | San Antonio, TX | 30 (a big city) | 0 | military (the Alamo), ghosts |
| M15 | Tombstone, AZ | 20 | 0 | true crime (the O.K. Corral) |
| M16 | Salem, MA | 20 | 0 | true crime and legend (1692) |
| M17 | St. Augustine, FL | 20 | 1 drafted | ghosts, history |
| M18 | Gettysburg, PA | 20 | 0 | military, ghosts |

**The size of the job:** 14 places at 30 and 4 at 20 is 500 approved echoes. About 310
are drafted across them today and 16 are approved. Counting only each place's shortfall,
about 270 more are still to write: 120 in the four towns around Wilmington, 109 in Tier 3,
28 in Chicago and 14 in New York. The drafted cities also need reshaping to their mix (Savannah and Charleston
are short of ghosts), and every drafted echo still needs James's review.

**The MVP drive** (James, 2026-11-05: "yes to the drive"): Wilmington to Kure Beach and
Fort Fisher along US 421, then the Fort Fisher ferry across the Cape Fear River to Southport.
It takes the driving mix in `13-story-mix.md` and reuses Tier 1's echoes where the road passes
them; the stretches between towns (Monkey Junction, Snow's Cut, the river crossing) need their
own, at one every 10 miles. Its route file and traced road (`build-route-paths.py`) come next.

The existing Blue Ridge Parkway drive and the JFK to Miami flight corridor stay as they are;
flights wait for an airline buyer (James, 2026-10-14).

Houston was on James's first list and was swapped for San Antonio: it has no walkable tourist
core, and San Antonio has the Alamo and the River Walk. Houston stays below under More cities.

## The full launch list

Counts are echoes in `content/echoes/` on 2026-10-14, every one still a draft.

## Major cities (18)

| # | City | Echoes now | Who |
|---|---|---|---|
| 1 | New York | 16 | |
| 2 | Orlando | 0 | |
| 3 | Las Vegas | 0 | |
| 4 | Los Angeles | 1 (Long Beach) | |
| 5 | Chicago | 0 | |
| 6 | Washington, DC | 1 | |
| 7 | San Francisco | 0 | |
| 8 | Miami | 2 (Ocean Drive) | |
| 9 | Honolulu | 0 | |
| 10 | Boston | 1 | |
| 11 | New Orleans | 0 | |
| 12 | San Diego | 1 | |
| 13 | Philadelphia | 1 | |
| 14 | Nashville | 0 | |
| 15 | Seattle | 0 | |
| 16 | Atlanta | 0 | |
| 17 | San Antonio | 0 | |
| 18 | Austin | 0 | |

## Secondary cities (22)

| # | City | Echoes now | Who |
|---|---|---|---|
| 19 | Wilmington, NC | 101 | Drafted; awaiting review |
| 20 | Charleston, SC | 0 | |
| 21 | Savannah, GA | 1 | |
| 22 | St. Augustine, FL | 1 | |
| 23 | Key West, FL | 0 | |
| 24 | Asheville, NC | 0 (Blue Ridge Parkway nearby) | |
| 25 | Natchez, MS | 0 | |
| 26 | Salem, MA | 0 | |
| 27 | Newport, RI | 0 | |
| 28 | Portland, ME | 0 | |
| 29 | Annapolis, MD | 0 | |
| 30 | Alexandria, VA | 0 | |
| 31 | Gettysburg, PA | 0 | |
| 32 | Williamsburg / Jamestown, VA | 0 | |
| 33 | St. Louis, MO | 0 | |
| 34 | Memphis, TN | 1 | |
| 35 | Pittsburgh, PA | 0 | |
| 36 | Galveston, TX | 0 | |
| 37 | Denver, CO | 0 (Estes Park nearby) | |
| 38 | Santa Fe, NM | 0 | |
| 39 | Tucson, AZ | 0 | |
| 40 | Portland, OR | 0 | |

## More cities (10)

| # | City | Echoes now | Who |
|---|---|---|---|
| 41 | Dallas / Fort Worth | 1 (Dealey Plaza) | |
| 42 | Houston | 0 | |
| 43 | Phoenix / Scottsdale | 0 | |
| 44 | Baltimore | 0 | |
| 45 | Minneapolis | 0 | |
| 46 | Detroit | 0 | |
| 47 | Kansas City | 1 | |
| 48 | Salt Lake City | 0 | |
| 49 | Charlotte | 0 | |
| 50 | Louisville | 0 | |

## Resort and getaway towns (12)

| # | Place | Echoes now | Who |
|---|---|---|---|
| 51 | Gatlinburg / Pigeon Forge, TN | 0 | |
| 52 | Myrtle Beach, SC | 0 | |
| 53 | Branson, MO | 0 | |
| 54 | Sedona, AZ | 0 | |
| 55 | Palm Springs, CA | 0 | |
| 56 | Lake Tahoe, CA/NV | 0 | |
| 57 | Napa / Sonoma, CA | 0 | |
| 58 | Hilton Head, SC | 0 | |
| 59 | Cape Cod, Nantucket and Martha's Vineyard, MA | 0 | |
| 60 | Niagara Falls, NY | 0 | |
| 61 | Maui, HI | 0 | |
| 62 | Alaska cruise ports (Juneau, Ketchikan, Skagway, Anchorage) | 0 | |

## Historic towns (12)

| # | Place | Echoes now | Who |
|---|---|---|---|
| 63 | Plymouth, MA | 0 | |
| 64 | Lexington and Concord, MA | 0 | |
| 65 | Mystic, CT | 0 | |
| 66 | Lancaster / Hershey, PA | 0 | |
| 67 | Monterey / Carmel, CA | 0 | |
| 68 | Santa Barbara, CA | 0 | |
| 69 | Tombstone, AZ | 0 | |
| 70 | Deadwood, SD | 0 | |
| 71 | Mackinac Island, MI | 0 | |
| 72 | Fredericksburg, TX | 0 | |
| 73 | Cooperstown, NY | 0 | |
| 74 | Bar Harbor, ME | 0 | |

## National parks (8)

| # | Park | Echoes now | Who |
|---|---|---|---|
| 75 | Great Smoky Mountains | 0 | |
| 76 | Grand Canyon | 0 | |
| 77 | Yellowstone | 0 | |
| 78 | Yosemite | 0 | |
| 79 | Zion | 0 | |
| 80 | Rocky Mountain | 0 (1 in Estes Park, its gateway) | |
| 81 | Acadia | 0 | |
| 82 | Mount Rushmore and the Black Hills | 0 | |

## Scenic drives (6)

| # | Drive | Length | Echoes to cover | Echoes now | Who |
|---|---|---|---|---|---|
| 83 | Route 66, Chicago to Santa Monica | ~2,400 mi | ~240 | 0 | |
| 84 | Pacific Coast Highway | ~650 mi | ~65 | 0 | |
| 85 | Blue Ridge Parkway | 469 mi | ~47 | a few (Linn Cove, Craggy Gardens, Mount Mitchell, Linville Gorge) | |
| 86 | Natchez Trace Parkway | 444 mi | ~44 | 0 | |
| 87 | Overseas Highway, Florida Keys | 113 mi | ~12 | 0 | |
| 88 | Going-to-the-Sun Road, Glacier | 50 mi | ~5 | 0 | |

## How much

82 places at 30 echoes is about 2,460, plus about 410 for the drives: **about 2,900 echoes**, of
which about 130 exist. A city's walkable core and a drive's echoes overlap where they meet
(Santa Monica, Asheville, Natchez, Key West), so the real figure is a little lower.

## Who does which

James supplies echoes for some cities; Claude Code sessions research and draft the rest from
public-domain sources (ADR-0006), and James reviews those before approval. The **Who** column
says which. Until James names his, sessions start with the cities richest in public records:
Washington, Boston, Philadelphia, New Orleans, Charleston, Savannah, St. Augustine, and the
national parks, whose histories the Park Service publishes.

Orlando and Las Vegas top the visitor counts, but people go for theme parks and casinos;
their downtown history is thinner and takes more research per echo.
