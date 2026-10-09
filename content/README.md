# The echo library

This directory is the system of record for what is true. Postgres is the system of record
for what gets served; it is built from here (ADR-0005).

## Rules

1. Every claim traces to a source in the echo's `sources` array, with the date we
   retrieved it. Sources move and vanish.
2. **Public domain and CC-BY only** for the MVP (ADR-0006). Not because facts are
   copyrightable — they are not — but so that every claim traces to something anyone can
   open and check, with no licence conversation attached. CC-BY-SA and licensed material
   are rejected by CI until there is a rights desk. A **draft** may cite any credible,
   linked source as `fair-use-facts`; it has to meet this rule before approval. A ghost
   story may keep the place's own account of its legend even then, and its script says out
   loud that the legend is reported, not proven (ADR-0016).
3. `editorial: approved` is a human's decision. A model may draft and may open the pull
   request. A model may never merge one.
4. `content/echoes/true-crime/` is CODEOWNERS-gated. Two credible sources minimum, three
   when a living person was not convicted, an explicit conviction status, a named
   reviewer and a content warning, plus at least one primary public record rather than a
   chain of retellings. `validateLibrary` enforces all of it in CI.
5. Wikipedia is for finding subjects and their original sources. It is not itself a
   source, and its prose is never the basis for a script.

## Fact and folklore (ADR-0017)

History, True Crime, People, Landmarks, Nature, Food & Drink and Arts are **fact**: certainty
`documented` or `contested`, verified before approval. Ghosts, folklore and local myths are
**folklore**: certainty `legend`, always. Every screen marks which one a listener is hearing:
"True story · not yet verified", "✓ True story · verified", "Disputed" or "Legend · not fact".

## Layout

```
routes/    Flight corridors we build packages for.
echoes/   One file per echo, grouped by category.
```
