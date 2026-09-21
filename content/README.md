# The story library

This directory is the system of record for what is true. Postgres is the system of record
for what gets served; it is built from here (ADR-0005).

## Rules

1. Every claim traces to a source in the story's `sources` array, with the date we
   retrieved it. Sources move and vanish.
2. **Public domain and CC-BY only** for the MVP (ADR-0006). Not because facts are
   copyrightable — they are not — but so that every claim traces to something anyone can
   open and check, with no licence conversation attached. CC-BY-SA and licensed material
   are rejected by CI until there is a rights desk.
3. `editorial: approved` is a human's decision. A model may draft and may open the pull
   request. A model may never merge one.
4. `content/stories/true-crime/` is CODEOWNERS-gated. Two credible sources minimum, three
   when a living person was not convicted, an explicit conviction status, a named
   reviewer and a content warning, plus at least one primary public record rather than a
   chain of retellings. `validateLibrary` enforces all of it in CI.
5. Wikipedia is for finding subjects and their original sources. It is not itself a
   source, and its prose is never the basis for a script.

## Layout

```
routes/    Flight corridors we build packages for.
stories/   One file per story, grouped by category.
```
