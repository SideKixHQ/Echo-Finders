# The echo library

One file per echo. Grouped by category.

## Status

Everything here is currently a **draft**. Nothing has been fact-checked against primary
sources, and nothing may be published until a human has done that — see ADR-0005.

That is the pipeline working, not a shortcut: a model may research, draft and open the pull
request; only a person may merge it. `npm run content:validate` refuses to let anything be
marked `approved` while its `factCheck` is `unchecked`, so the gate cannot be skipped by
accident.

## Writing one

```yaml
id: kebab-case-and-stable          # becomes the filename and the URL
title: A sentence, not a label
summary: One line for the map pin
place: What the narrator says out loud
at: { lat: 40.70331, lng: -74.01705 }
triggerRadiusKm: 0.09              # 0.05 a doorway · 0.5 a neighbourhood · 60 a city
category: history
format: short                      # look-below 30s · short 90s · feature 3½m · deep 10m
visibility: at-hand                # at-hand · landmark-visible · position-only · daylight-dependent
certainty: documented              # documented · contested · legend
script: |
  The narration, as it will be read.
sources:
  - title: ...
    publisher: National Park Service
    url: https://www.nps.gov/...
    retrievedAt: "2026-09-21"
    rights: public-domain          # public-domain or cc-by only (ADR-0006)
```

Omit `editorial` and `factCheck` and the file is a draft whose facts nobody has checked,
which is the honest default.

## Before marking one approved

1. Open every source and confirm every claim in the script against it.
2. Set `factCheck: corroborated` (or `single-source` for a fun fact with one solid source).
3. Set `editorial: approved`.
4. Check `certainty` is honest. A ghost story is `legend`, not `documented`, and anything
   not documented needs a `certaintyNote` saying what is disputed and by whom.
5. For true crime, read the extra rules in `docs/adr/0006-public-domain-only.md`. Two
   sources minimum, three when a living person was not convicted, one of them a primary
   public record, a named reviewer and a content warning.

## Checking your work

```bash
npm run content:validate
```
