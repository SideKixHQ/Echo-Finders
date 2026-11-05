# The story mix, and what makes an echo rare

*Echo Finders is a Whatishere.com product.*

James (2026-11-05): "we should set parameters for how many of which type we have and what
defines uncommon or rare echos. I bet people will want true crime, history, military and
what else... lets just double check and make sure we have the right stories."

Written 2026-11-05. **Decided the same day** (James): "approve the mix and rarity, keep
military in history - i do think its ok to change the mix based on the city. Lets keep that
in mind some cities will be crime or ghost heavy." The decisions are at the end.

## What people listen to and pay for

| Signal | What it says | Source |
|---|---|---|
| True crime is now the #1 podcast topic among weekly US listeners (Q2 2026), ahead of comedy for the first time since Edison began tracking it in 2019 | The single biggest audio appetite | Edison, via Media Confidential |
| True crime's weekly podcast audience went from 6.7M adults (2019) to 19.1M (2024) | Still growing | Edison True Crime Consumer Report |
| Women are almost twice as likely as men to listen to true crime regularly (44% vs 23%) | True crime brings in women | Pew, 2023 |
| WWII is the history topic Americans think about most; the Civil War is second. Men lead on WWII by 9 points and on the Civil War by only 4 | Military history is real demand, and skews male | YouGov |
| Gettysburg alone drew about 742,000 visitors in 2023 | People travel to stand where a battle happened | NPS |
| The most-reviewed walking tours in Savannah, New Orleans and Salem are ghost or "history and hauntings" tours. Salem's leader has about 16,000 reviews | Ghosts are what people pay to walk for, especially in old Southern cities | TripAdvisor / Viator listings |
| 39% of Americans believe in ghosts, 19% are unsure (Gallup, May 2025) | About half the audience is open to a ghost story; the rest still enjoy one told as legend | Gallup |
| 78% of US leisure travelers do cultural or heritage activities, and 66% visit historic sites. They spend $994 a trip against $611 | History is the broad base, and its audience spends | Mandala Research, 2009 (old; no newer figure found) |
| Food tours carry some of the highest review counts on Viator | Food is a top reason to walk a city | Viator listings |

**Not found:** no audio-tour app (VoiceMap, Autio, GuideAlong, Shaka Guide) publishes which
story types its listeners finish or replay. Edison's own genre pages could not be opened from
this session, so the podcast rankings come from press coverage of them.

### What that means for us
1. **History stays the backbone**, but it is over-weighted. The appetite is for history
   with a hook: a battle, a crime, a ghost, a person.
2. **True crime is the biggest demand and our hardest supply.** It is opt-in, every echo needs
   a court, coroner or government record (`validate.ts`), and it carries a disclaimer. Worth
   the effort, but it cannot be most of a city.
3. **Ghosts are under-supplied exactly where they sell best.** Savannah has one, Charleston
   none.
4. **Military is wanted, and we already have it, filed under history.** 54 echoes carry a war
   tag (revolution, civil-war, war-of-1812); 45 of them are `history`.
5. **Food is nearly absent** (3 of 329) despite being a top reason to walk a city.

## What we have now (2026-11-05, 329 echoes)

| Category | Echoes | Share |
|---|---|---|
| history | 141 | 43% |
| built | 57 | 17% |
| people | 43 | 13% |
| arts | 27 | 8% |
| legend (ghosts, folklore) | 23 | 7% |
| true-crime | 20 | 6% |
| kids | 11 | 3% |
| land | 5 | 2% |
| food-drink | 3 | 1% |

By city (echoes tagged with the city's name):

| City | Mix |
|---|---|
| Wilmington | history 30, people 22, built 17, arts 15, kids 10, true crime 6, legend 5 |
| Boston | history 19, built 4, arts 3, people 2, legend 2, true crime 1 |
| Charleston | history 19, built 7, arts 3, people 1 |
| Savannah | history 14, built 10, people 5, legend 1 |
| New Orleans | history 15, people 4, legend 4, built 4, land 1, food 1, arts 1 |
| Washington | history 21, built 6, arts 4, people 3, legend 2, true crime 1 |
| Philadelphia | history 18, people 5, built 5, legend 1, land 1, arts 1 |

## The mix: a 30-echo city

A city is covered at 30 approved echoes (`12-cities.md`). The shape for those 30:

| Category | Per city | Share | Now | Note |
|---|---|---|---|---|
| History | 9 | 30% | 43% | At least 3 of the 9 military (battle, fort, war, occupation) |
| Ghosts & legend | 5 | 17% | 7% | Told as legend, male narrator |
| True crime | 4 | 13% | 6% | Opt-in; each needs a public record |
| People | 4 | 13% | 13% | |
| Built | 3 | 10% | 17% | Strongest when it carries a story, not a style |
| Arts (music, film, painting, books) | 2 | 7% | 8% | Film locations count here |
| Food & drink | 2 | 7% | 1% | What was eaten and drunk here, and what still is |
| Land | 1 | 3% | 2% | More in parks and on drives, fewer in cities |
| **Total** | **30** | | | |
| Kids | +3 | | | An audience, not a subject (`types.ts`): children's tellings on top of the 30 |

Flex rules:
- Each count may move by **±2** for a city's character without saying why. Nothing may fall
  to zero except land.
- **A city may lean further, on purpose.** Some are crime cities or ghost cities, and the mix
  should say so rather than flatten them (James, 2026-11-05). New Orleans, Savannah and
  Charleston are ghost-heavy; a city whose story is its crimes can be crime-heavy. The lean is
  written down per city with its reason, so it reads as a decision rather than drift.
- A **national park** inverts it: land 10, history 8, people 4, legend 4, built 2, true crime
  0 to 2.
- A **drive** follows what is beside the road, so it gets no target. It is covered at one echo
  every 10 miles (`12-cities.md`).

Checked by a `content:status` line per city, not by the validator: a mix is a goal for writing,
not a reason to refuse a true echo.

## The mix by way of travel

James (2026-11-05): "If its walking lets do what we decided based on research. flying and
driving we can increase different types. probably need more kids stuff driving and flying as
well."

The 30-echo table above is the **walking** mix. A drive and a flight are different listens:
families in the car or the cabin, a view of land rather than a doorway, and time to fill
between places. So they lean towards land, legend and kids, and away from true crime. Drives
and flights are counted per 20 echoes along the route, not per city.

| Category | Walking (per 30) | Driving (per 20) | Flying (per 20) |
|---|---|---|---|
| History (incl. military) | 9 | 4 | 5 |
| Ghosts & legend | 5 | 3 | 2 |
| True crime | 4 | 2 | 0 |
| People | 4 | 2 | 2 |
| Built | 3 | 2 | 3 |
| Arts | 2 | 1 | 1 |
| Food & drink | 2 | 2 | 1 |
| Land | 1 | 4 | 6 |
| **Kids tellings, on top** | **+3 (10%)** | **+5 (25%)** | **+6 (30%)** |

Why each one moves:
- **Land** rises because it is what you can see: a river, a ridge, a coastline. From the air
  it is most of the view.
- **Kids** rises because a back seat or a seatback is where children are a captive audience,
  and the hours are long.
- **True crime** falls on a drive and goes to zero on a flight by default. On a flight the
  airline decides (`airline admin: category restrictions`, `00-build-plan.md`); a passenger
  can still opt in where the airline allows it.
- **Food** holds on a drive, because a road trip stops to eat.
- **Built** rises on a flight: bridges, dams and city grids read from 35,000 feet.

Kids tellings are an audience, not a subject (`types.ts`), so the extra kids share means more
children's versions of the land, history and legend echoes along the route, not a separate
pile of kids-only echoes.

## Rarity: what makes an echo uncommon or rare

### What the code does today
`packages/core/src/capture/rarity.ts` earns rarity from three facts:

| Fact | Scores |
|---|---|
| Trigger radius ≤ 50 m ("find the exact spot") | +2 |
| Trigger radius ≤ 150 m ("be close") | +1 |
| Only open at certain hours or seasons (`hours`) | +1 |
| Remoteness ≥ 0.7 / ≥ 0.4 | +2 / +1 |

Common is 0, uncommon 1 to 2, rare 3, singular 4 or more.

### Why it does not work
**318 of 329 echoes are "uncommon", 10 are common, 1 is rare, 0 are singular.**
- The standard walking radius is 40 m (227 echoes). 264 echoes sit at 50 m or less and score
  +2 for "exact spot" just by existing; 38 more at 60 m score +1.
- `remoteness` is set on 1 echo and `hours` on 1, so nothing else ever adds a point.

A tier that 97% of the library shares tells a listener nothing, and the map's warm
"uncommon" ring is on almost every pin.

### The principle to keep
`rarity.ts` and `04-shape-of-the-app.md` already say it: rarity is **earned from facts
about the place, never assigned**. A collection only means something if a rare echo was
actually harder to get. So the fix is to measure real difficulty, not hand out labels or
quotas.

### The rule (approved)
Drop the radius as a scorer. A standard radius is the default, not a difficulty. Score what
actually makes a place harder to reach:

| Fact | Scores | How it is known |
|---|---|---|
| Off the main walk: more than 400 m from the city's core cluster of echoes | +1 | Computed from the library itself |
| Far off it: more than 1.5 km, or outside the city entirely | +2 | Computed |
| Only open at certain hours, days or seasons | +1 | `hours`, set when writing |
| Inside somewhere you must enter (a church, museum, bar, cemetery with gates) | +1 | New `inside: true` field |
| A precise spot that is genuinely hard to find (a plaque, a mark on a wall, one grave) | +1 | A radius set below the standard one on purpose: 30 m or less |

Common 0, uncommon 1, rare 2, singular 3 or more.

Expected shape, from the facts rather than forced: roughly **60% common, 25% uncommon,
12% rare, 3% singular** per city. If a city comes out with nothing rare, that is honest: its
echoes are all on the main walk. The fix then is to write echoes further out, not to relabel
the ones we have.

## Decisions (James, 2026-11-05)
1. **The mix:** approved for walking, with cities free to lean crime-heavy or ghost-heavy
   (above). Driving and flying lean towards land, legend and kids (James, 2026-11-05; the
   table under "The mix by way of travel").
2. **Military:** stays inside history, counted as a theme (at least 3 of a city's 9).
3. **Rarity:** approved. Radius stops scoring; distance from the core, hours, going inside and
   a deliberately tight spot score instead.
4. **Still open:** sports has no category. Film and music fit under arts.

## Sources
- [Edison Research: True Crime now top podcast genre (Media Confidential, 2026)](https://mediaconfidential.blogspot.com/2026/09/edison-research-true-crime-now-top.html)
- [True Crime Podcast Listeners Triple in Five Years (Edison Research)](https://edisonresearch.com/true-crime-podcast-listeners-triple-in-five-years/)
- [Edison: Comedy is top podcast genre, Q1 2024 (Talkers)](https://talkers.com/2024/05/23/edison-comedy-is-top-podcast-genre/)
- [Triton Digital 2025 U.S. Podcast Report](https://blog.tritondigital.com/2025-u.s.-podcast-report-trends-shaping-listening-and-growth-in-2025)
- [Pew Research on podcast listening, 2023](https://www.pewresearch.org/?p=7939)
- [YouGov: how often Americans think about historical topics](https://yougov.com/en-us/articles/47481-men-women-thinking-about-the-roman-empire-poll)
- [Gettysburg NMP economic benefits (NPS)](https://www.nps.gov/gett/learn/news/2022-economic-benefits.htm)
- [Ghost tours ranked by actual visitors (Mental Floss)](https://www.mentalfloss.com/geography/wanderlust/best-ghost-tours-america-actual-visitors)
- [Think you saw a ghost? 4 in 10 Americans (Gallup 2025, via SAN)](https://san.com/cc/think-you-saw-a-ghost-4-in-10-americans-are-ready-to-believe-you-experts-are-torn/)
- [Cultural heritage travel study (Mandala Research, 2009, via NASAA)](https://nasaa-arts.org/newsletter/2010-nasaa-notes-issues/january-2010-nasaa-notes/cultural-heritage-travel-contributes-192-billion-annually-u-s-economy/)
- [StoryRabbit's category list (App Store)](https://apps.apple.com/us/app/storyrabbit/id6502330315)
