# True crime: how to research and write it, every time

*Echo Finders is a Whatishere.com product.*

James (2026-11-09): "True crime is extremely important so let's find the right way to do this
over and over." True crime is the biggest audio appetite there is (`13-story-mix.md`) and
the one category that can hurt someone. This is the method: what to read, in what order,
what counts as two sources, how to say it, and what to do when you are stuck. The legal
reasoning is in `protection-policy.md` (Risks 2, 3 and 6); the rules are enforced by
`validateTrueCrime` in `packages/core/src/content/validate.ts`. Follow this and an echo
passes both the first time.

## What the code refuses to publish

An approved true-crime echo fails CI unless it has all of these:

| Rule | Field |
|---|---|
| At least **two** sources, and **three** when a living person named was not convicted | `sources` |
| `factCheck: corroborated`: the key facts each backed by two independent sources | `factCheck` |
| Age 16 and over | `minAge: 16` |
| A conviction status: `convicted`, `alleged`, `unsolved` or `exonerated` | `trueCrimeReview.convictionStatus` |
| Whether a living person is involved | `trueCrimeReview.involvesLivingPeople` |
| A content warning, read before the echo begins | `trueCrimeReview.contentWarning` |
| James's sign-off, named and dated | `trueCrimeReview.reviewedBy`, `reviewedAt` |
| An `alleged` case about someone alive says whose claim it is, in words the listener hears | `script` |
| An `exonerated` case says aloud that the conviction did not stand | `script` |

`true-crime` can never be `legend` (ADR-0009). A ghost story about a murder is a legend
echo that may mention the murder, sourced as history.

## The source ladder

Work down it. Stop when every key fact has two independent sources.

1. **The record itself.** Court opinions and filings, coroner's and police reports, prison
   and parole records, government investigations (a commission, a congressional committee).
   Best of all, because a fair and accurate report of an official proceeding is protected
   (fair report privilege, `protection-policy.md`).
   *Reachable:* www.justice.gov, www.archives.gov, www.bop.gov, history.state.gov,
   law.justia.com, emuseum.jfk.org, state archives.
2. **Contemporary reporting.** The newspapers that covered it at the time.
   *Reachable (tested 2026-11-09):* Chronicling America (chroniclingamerica.loc.gov,
   tile.loc.gov) up to 1963; state archives that go later: Georgia
   (gahistoricnewspapers.galileo.usg.edu), New York (nyshistoricnewspapers.org), Virginia
   (virginiachronicle.com); the Google News Archive (news.google.com/newspapers); the
   Internet Archive (archive.org). *Allowed but timing out that day:* North Carolina
   (www.digitalnc.org), Florida (ufdc.ufl.edu), Texas (texashistory.unt.edu),
   fultonhistory.com. Try them again before giving up.
3. **Established news and broadcast since.** A major paper, a public broadcaster, network
   news. *Reachable:* www.bostonglobe.com, www.latimes.com, www.chicagotribune.com,
   www.npr.org, www.wbur.org, www.cbsnews.com, www.nbcnews.com, abcnews.go.com.
   A page behind a paywall is not usable even when the site answers.
4. **Institutions with a stake, as one source, never two.** The museum where it happened,
   the site's own history page, a historical society. Good for what happened at their door;
   not independent of the story they tell about themselves.

**Refuse automated requests** (do not try to get around them; pick another rung): AP,
Reuters, the New York Times, fbi.gov and vault.fbi.gov, CourtListener, Smithsonian,
Britannica, the California, Colorado and Illinois newspaper archives. The Washington Post
did not answer. A
paywall or a "checking your browser" page is the same: not usable. The Library of
Congress's public data feed (`?fo=json`) is normal access, not a workaround.

**Never sources:** Wikipedia (find the case there, then cite what it cites), Murderpedia,
true-crime blogs and podcasts, Reddit, Find a Grave memorials, tour operators' scripts.

## What "independent" means

Two sources are independent when neither got the fact from the other.

- Two pages from one publisher are **one** source (two NPS pages, two FBI pages).
- A wire story printed in three papers is **one** source.
- A museum page and a newspaper report of the museum's press release are **one** source.
- A court opinion and a newspaper's report of the trial **are** two.
- A 1990 report and a 2015 retrospective that interviewed the investigators **are** two.

`factCheck: corroborated` means the *key* facts are each in two independent sources: what
happened, when, where, who was convicted or accused, and how it ended. A colour detail may
rest on one source if the script attributes it ("the museum says").

## Saying it

By conviction status:

| Status | Say | Never say |
|---|---|---|
| `convicted` | "was convicted of", "a jury found him guilty", then the fact as fact | Anything beyond what the conviction covers |
| `alleged` | "police said", "was charged with", "prosecutors alleged", "according to the Warren Commission" | "he did it", or a charge stated as fact |
| `unsolved` | What happened, and that no one was charged or convicted | Any name as the culprit, or "the man everyone knows did it" |
| `exonerated` | The exoneration **in the same breath** as the conviction | The conviction alone, or the exoneration as an afterthought |

And always:

- **Living people.** Name a living person only if they are already public in this story
  (charged, convicted, an official, an author). Never a living victim without their own
  public statement. Never relatives. `involvesLivingPeople: true` when anyone named may be
  alive; that triggers the three-source rule and the attribution rule for alleged cases.
- **Victims are people, not set dressing.** No graphic detail of injuries, no "gruesome",
  no music cue on the violence. The echo is about the place and what it meant.
- **Where it happened is somebody's grief** (`protection-policy.md`, Risk 6). No rarity, no
  collection prompt, and the listener stands on the public sidewalk, never on the doorstep
  of a private home.
- **Contributions are never true crime** (ADR-0013).

## The workflow

1. **Draft** with sources from the ladder, `editorial: draft`, `factCheck: single-source`
   until the second independent source is in.
2. **Fact-check** every checkable sentence against a verbatim quote (`check-drafts`), then
   confirm the quotes are on the fetched pages.
3. **Pre-flight the true-crime rules**: set the draft to `approved` locally, run
   `node scripts/validate-content.mjs`, read the true-crime errors, fix, set it back.
4. **James reviews.** His approval fills `reviewedBy: "James (owner), approved YYYY-MM-DD"`
   and `reviewedAt`. Nothing else approves true crime.
5. **Record** in the male narrator unless cast otherwise, then gate, PR, merge.

## When you are stuck

- **Only one source reachable:** keep it a draft and say which fact needs the second
  source. Do not lower the bar, and do not mark it corroborated from one publisher.
- **The source exists but is blocked or paywalled:** say which. James can look one fact up
  through his public library's newspaper databases (ask the library which it offers;
  many give card holders free access to newspaper archives). A library database is for a
  person checking, never for an agent to log into.
- **A host is refused by the network:** name it. Adding hosts is James's call in the
  environment settings; the list in "The source ladder" is what he allowed on 2026-11-09.
- **Sources disagree:** say the range or say less ("more than a hundred arrests"), and note
  the conflict in the echo's comments for the reviewer.

## For agent briefs

A research agent drafting or fact-checking true crime is pointed at this file. Its report
lists, per echo: conviction status, whether living people are named, each key fact with
its two sources, and anything held for want of a source.
