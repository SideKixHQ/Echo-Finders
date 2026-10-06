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

**Read `docs/writing-echoes.md` first.** The schema below says what a file needs;
that says what makes one worth hearing, which is the harder half.


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

## Claims: each checkable sentence beside its quote

Every sentence with a number, a date, a counting word, a superlative or a name is a claim
that is either right or wrong. Before an echo can be approved, each one needs an entry in
`claims` saying which source backs it and quoting the passage verbatim:

```yaml
claims:
  - says: between 1808 and 1811          # the words in the script making the claim
    source: 1                            # which of `sources`, counting from 1
    quote: "…copied exactly from the source, never paraphrased…"
```

`npm run content:validate` refuses an approved echo with an unbacked sentence. The quotes
are a reviewer's aid, not proof: whoever writes one (a person or a model) can get it wrong,
so the reviewer still opens the source and confirms the quote is really there.

## Where the library stands

```bash
npm run content:status                       # every echo: what it still needs
npm run content:review -- <echo-id> > r.md   # a one-page review sheet for one echo
```

## Before marking one approved

1. Run `npm run content:review -- <id>`. Fill in `claims` until nothing is listed as not
   yet backed, then check every quote is really in its source.
2. Open every source and confirm every claim in the script against it, including any the
   sheet could not detect. It finds sentences mechanically; it cannot find them all.
3. Set `factCheck: corroborated` (or `single-source` for a fun fact with one solid source).
4. Set `editorial: approved`.
5. Check `certainty` is honest. A ghost story is `legend`, not `documented`, and anything
   not documented needs a `certaintyNote` saying what is disputed and by whom.
6. For true crime, read `docs/protection-policy.md` before writing a word. Two sources
   minimum, three when a living person was not convicted, one of them a primary public
   record, a named reviewer and a content warning.

## The one thing to understand before writing true crime

"It has already been published" is **not** a defence. Repeating someone else's defamatory
statement is a fresh publication, and the republisher is as liable as the original speaker.

What protects us is narrower: a fair and substantially accurate report of an **official
proceeding** — a court filing, a coroner's report, a government archive. That is why one
primary public record is required and two retellings are not enough. The protection is not
"somebody said it first"; it is "a court said it, and we reported the court accurately".

The dead cannot be defamed, so most history carries almost no risk on this axis. The
exposure is concentrated in living people, unsolved cases, allegations and exonerations —
and in statements about the dead that reflect badly on a living relative.

## Checking your work

```bash
npm run content:validate
```
