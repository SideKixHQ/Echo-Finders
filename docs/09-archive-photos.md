# Archive photographs: candidates for the Lower Manhattan walk

*Echo Finders is a Whatishere.com product.*

Every "Then & Now" plate in the app is still a drawn stand-in (`apps/prototype/src/archive-plate.ts`,
credit "DEMO stand-in, no archive plate sourced yet"). This is the worklist for replacing them with real
photographs.

**Nothing here is cleared yet.** These were found by web search from a cloud session that could not open
loc.gov, nypl.org or wikimedia.org, so no rights line has been read on an item page. ADR-0006 allows public
domain and CC-BY only: open each item page and record the exact rights statement before anything ships.

What to expect:
- **LoC Detroit Publishing Co. (`det`) and Bain News Service (`ggbain`)** glass negatives are normally
  "No known restrictions on publication" and almost all predate 1930. The strongest source here.
- **NYPL Milstein street photographs** (Sperr, Suydam) vary between "Public Domain" and "copyright
  undetermined". Check each one.
- "Snippet" below means the search result itself quoted "no known restrictions", which is still not a page check.
- Direct image URLs follow LoC's tile.loc.gov pattern and are untested.

| Echo | Best candidate | Year | Item page | Rights seen | Vantage |
|---|---|---|---|---|---|
| african-burial-ground | Duane Street – City Hall Place (Sperr, NYPL) | 1927 | https://digitalcollections.nypl.org/items/de9609a0-c54c-012f-6673-58d385a7bc34 | unverified | Duane St, a block east of the site. **No confirmed PD view of the site itself.** |
| bowling-green-king-george | Bowling Green, New York (Detroit, LoC) | c.1900 | https://www.loc.gov/item/2016801876/ | snippet: no known restrictions | Park and fence |
| canyon-of-heroes | Lindbergh ticker-tape parade up Broadway (World-Telegram, LoC) | 1927 | https://www.loc.gov/item/2001700254/ · https://www.loc.gov/item/2001700260/ | unverified, check carefully | Lower Broadway |
| castle-clinton-eight-million | The Aquarium, Old Castle Garden (Detroit, LoC) | c.1900 | https://www.loc.gov/resource/det.4a08578/ · alt https://www.loc.gov/item/2016816901 · immigrant depot stereograph https://www.loc.gov/item/2017648898 | unverified | Battery promenade |
| charging-bull-illegal | Bowling Green and Lower Broadway (Detroit, LoC) | c.1900 | https://www.loc.gov/item/2016794173 | unverified | Looking north up Broadway from the bull's spot |
| city-hall-declaration | City Hall Park, N.Y. (Detroit, LoC) | 1915 | https://www.loc.gov/item/2016797122/ | unverified | In the park |
| federal-hall-two-firsts | U.S. Sub-treasury, Wall St. (Detroit, LoC) | c.1900 | https://www.loc.gov/item/2016808417 | unverified | Wall St, facing the steps and statue |
| fraunces-tavern-farewell | Fraunces Tavern (Detroit, LoC) | 1900–20 | https://www.loc.gov/item/2016795938/ | unverified | Pearl and Broad corner |
| st-pauls-still-standing | Church St over St. Paul's Chapel (stereograph, LoC) | 1902 | https://www.loc.gov/item/2017658243 | unverified | Elevated. **No street-level PD photo found.** |
| trinity-tallest-thing | Broadway and Trinity Church (Detroit, LoC) | 1880–1901 | https://www.loc.gov/item/2016797175/ | snippet: no known restrictions | On Broadway facing the church |
| wall-street-the-wall | Wall St. and Trinity Church (Detroit, LoC) | c.1903 | https://www.loc.gov/item/2016799640/ · alt stereograph https://www.loc.gov/item/2004665501 | snippet: no known restrictions | Down Wall St to Trinity, good for re-photography |
| pearl-street-oysters | Maiden Lane – Pearl Street (Suydam, NYPL) | 1914 | https://digitalcollections.nypl.org/items/510d47dd-4923-a3d9-e040-e00a18064a99 | unverified | Pearl and Maiden Lane. LoC "Pearl Street" hits are Albany: avoid. |
| wall-street-1920-the-scars | Wall St. bomb (Bain, LoC) | Sept 1920 | https://www.loc.gov/item/2014711464 · more frames 2014711360, 2014711457, 2014711458 | snippet: no known restrictions | Wall and Broad aftermath |

## To finish
1. Open each item page and copy the rights line. Drop anything that is not public domain or CC-BY.
2. Download the largest TIFF/JPEG, and for each plate record year, caption, credit (collection and
   item URL) and the vantage point in the echo's content file.
3. Replace the drawn plates: delete `archive-plate.ts` and render `<img src={resolve(photo.imageKey)}>`,
   and stop `scripts/build-library.mjs` stamping the demo credit.
4. The "now" half needs a photograph from the same spot. Taking those on a walk is the cheapest route.
