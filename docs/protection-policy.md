# Echo Finders — Content Protection Policy

**A working document for legal review. Written by an engineer, not a lawyer.**
Last updated: 21 September 2026 · Echo Finders is a Whatishere.com product.

This exists to make the lawyer conversation cheap. Rather than "review our content
strategy", it isolates each distinct legal exposure, states what we already do about it,
and marks the specific questions that need a professional answer.

**Jurisdiction:** written against US law, which is where the first routes are. England and
Wales and the EU differ in ways flagged at the end, and those differences matter more than
they sound.

---

## The correction this document exists to make

> *"We only tell stories that have already been told, using open media."*

That is a sound policy and it solves exactly one of the six risks below.

It solves **copyright**, because public-domain and openly licensed material can be reused.
It does **not** solve **defamation**, because of the republication rule: repeating someone
else's defamatory statement is itself a fresh publication, and the republisher is generally
as liable as the original speaker. "A newspaper printed it in 1998" is not a defence.

These two risks feel like one thing and are not:

| | Question it asks | Solved by |
|---|---|---|
| **Copyright** | May I use this *expression*? | Public-domain / CC-BY sourcing |
| **Defamation** | Is this statement *false and harmful* about a living person? | Truth, primary records, fair report privilege |

Conflating them is how a well-sourced library still ends up with a letter from a lawyer.

---

## Risk 1 — Copyright

**What it protects:** expression. The words, the structure, the selection and arrangement.

**What it does not protect: facts.** Under *Feist Publications v. Rural Telephone Service*,
facts are not copyrightable however much effort went into gathering them. Reading that a
lighthouse was built in 1847 and writing our own sentence about it infringes nothing,
whatever the source.

### Our controls
- `MVP_POLICY` permits **public domain and CC-BY only**, enforced in CI (ADR-0006).
- **CC-BY-SA excluded** despite being free: share-alike can propagate into derivative works,
  and a viral licence term inside a product licensed to an airline is the kind of surprise
  that surfaces during their legal review, not ours.
- **Scripts are original prose.** Copying source wording is prohibited even from public-domain
  text, because the habit is what eventually copies something that is not.
- Every source records a retrieval date.

### Residual risk
- **Archival photographs.** A public-domain *photograph* may still sit behind a museum's
  claimed rights in its scan. Confirm per image.
- **Translations.** A translation of a public-domain work carries its own copyright.
- **Anything a contributor uploads.** Covered under Risk 5.

### For the lawyer
1. Is our CC-BY attribution — credit in the transcript and a credits screen, not read aloud —
   sufficient?
2. Does a narrated audio work count as a derivative of a CC-BY *text* source, and does that
   change the attribution obligation?

---

## Risk 2 — Defamation

**The exposure concentrates in a narrow band**, and almost none of the library sits in it.

**The dead cannot be defamed.** Under the common-law rule in nearly every US state there is
no claim for a false statement about someone who has died. Most of our history is therefore
close to risk-free on this axis.

**Two exceptions bring it back.** A statement about a dead person that reflects badly on a
*living* relative can be actionable by that relative. And a living person named in any
capacity is squarely exposed.

### Where our actual risk lives
- Living people named in crime stories, particularly where there was no conviction.
- Unsolved cases, where naming anyone implies guilt no court has found.
- Exonerations, where the original reporting is now known to be wrong and repeating it is
  worse than the first telling.
- Recent events still under investigation.

### Our controls
- **True crime requires at least one primary public record** — a court filing, coroner's
  report or government archive — not two retellings. This is not merely a quality rule: it
  is what puts us inside **fair report privilege**, which protects a fair and substantially
  accurate report of an official proceeding. The protection is never "somebody said it
  first"; it is "a court said it, and we reported the court accurately."
- **Three sources minimum** where a living person was not convicted.
- `convictionStatus` is a required field — `convicted`, `alleged`, `unsolved`, `exonerated`.
  The distinction between "was convicted of" and "was accused of" is the difference between
  a fact and a libel.
- A named human reviewer, recorded, per true-crime echo. Enforced in CI.
- Contributions may **never** be true crime.

### Rules for writers, in plain terms
- Never state or imply that an unconvicted person committed a crime.
- Attribute allegations to the proceeding, not to the world: *"prosecutors alleged"*, not
  *"he did"*.
- Where someone was exonerated, say so **in the same breath**, never as a postscript.
- Never name a living private individual who is not already a public figure in that story.
- Never name a living victim without a documented public statement from them.
- Fair report privilege requires **accuracy and fairness**. A true fact arranged to imply
  something false is not protected.

### For the lawyer
3. Does our primary-record rule reliably put us inside fair report privilege across the
   states our first routes cross?
4. What is our position on a person convicted and later exonerated, where the conviction is
   a matter of record and the exoneration is the story?
5. Should we adopt a fixed cooling-off period after any event before it can become an echo?
6. Do we need media liability insurance before the first true-crime echo ships?

---

## Risk 3 — False light and privacy

A distinct tort from defamation, aimed at emotional harm rather than reputation. It can
attach to statements that are **literally true** but arranged to create a false impression —
which is exactly the failure mode of atmospheric true-crime writing.

**Our controls.** Editorial rules forbid sensationalised description of victims, and the
`Respect` value's ban on "turning pain, tragedy or identity into disposable entertainment"
is the operative standard. `certainty` prevents legend being dressed as documented fact.

### For the lawyer
7. Does a *dramatised* reading — music, pacing, a narrator's tone — change our exposure
   where the words themselves are accurate?

---

## Risk 4 — Right of publicity, and synthetic voice

This one survives death, unlike defamation, and it is the risk our technology creates rather
than inherits.

**Post-mortem right of publicity** exists in many states and protects commercial use of a
person's name, voice, signature or likeness — in California for seventy years after death.
It is not about falsity; it is about commercial exploitation.

**Synthetic voice is the sharp edge.** Generating a narration that imitates a real person's
voice, living or dead, implicates this directly and is a fast-moving area of law. Several
states have recently legislated specifically on voice replication.

### Our controls
- **Never synthesise a real person's voice.** Not as homage, not as a "reading" of their
  words, not for anyone however long dead. One narrator voice, or a licensed actor.
- **Our narrators are designed, not cloned.** The default voice was generated from a
  description on 23 September 2026 (`content/voices.yml`). It resembles no particular
  person, so there is no publicity right attached to it — the risk is avoided at source
  rather than managed. A Voice Library voice would not have achieved this: those are
  contributed by other users, some are clones of real people, and the consent behind them
  is held by the contributor rather than by us, while we are the ones shipping the result
  inside a licensed product.
- Names and likenesses appear **editorially** — telling someone's story — never in
  marketing or on a sponsored placement.
- Contributors record only themselves.

### For the lawyer
8. Confirm the ElevenLabs licence permits redistribution inside a product licensed to a
   third party — this is a contract question as well as a publicity one.
9. Does naming a person in an echo, in an app that carries advertising elsewhere,
   constitute commercial use in the states we operate in?

---

## Risk 5 — User contributions

Contributions (ADR-0013) create exposures the editorial library does not have, and also
access to two protections it does not need.

### Section 230
In the US, platforms are generally not treated as the publisher of content their users
create. This is the single most valuable protection available to the contributions feature —
**and it can be weakened by how we behave**, particularly where we materially contribute to
the content rather than merely host it.

**Care needed:** our moderation, our trust system and any editing of contributions are all
fine in principle, but *rewriting* a contribution moves us towards authorship. Current
design keeps us as host: we accept or refuse, and we do not rewrite.

### DMCA safe harbour
For contributed audio that may contain someone else's music or recording, the safe harbour
requires specific, unglamorous steps:

- **Register a designated agent with the US Copyright Office** and publish their contact
  details. This is a prerequisite, not a nicety — without it the safe harbour is unavailable.
- A published **notice-and-takedown** process, and expeditious removal on valid notice.
- A **counter-notification** route for contributors whose work was removed in error.
- A **repeat-infringer** policy that is actually enforced.

**None of this exists yet.** It must be in place before contributions open.

### Our controls
- Reach is capped by trust: a first contribution carries fifty metres, so anything harmful
  reaches almost nobody before it is found.
- Reports hide content immediately, ahead of review.
- No contact details, no true crime, mandatory attribution.
- Contributors are pseudonymous to listeners but identified to us — anonymous contribution is
  materially more abusable.

### The unfinished protection
**`ProtectedArea` has no data behind it.** Private residences, memorials, burial grounds,
schools and disaster sites are defined in the model and unenforced in practice. Leaving an
echo at somebody's house is the obvious abuse of a place-anchored message, and it is also
the one that could produce a genuinely dangerous outcome. **This gates the contributions
launch.**

### For the lawyer
10. Does our trust-based reach system, or the act of refusing contributions, affect Section
    230 treatment?
11. What is the minimum viable DMCA compliance for audio contributions?
12. What is our obligation when a contribution describes a living person unflatteringly —
    are we the publisher for defamation purposes as we would not be in the US?

---

## Risk 6 — Cultural and human dignity

Not principally a legal risk, and the one most likely to cause real harm and lasting
reputational damage.

- **Burial grounds and human remains.** The African Burial Ground is in our first route.
  Descendant communities fought for that site. Content about it is told with their framing,
  from institutional sources, and never as a ghost story.
- **Indigenous sites.** Consult the relevant nation before publishing. Sacred sites are
  frequently not ours to point tourists at, and "it is in the public record" is not consent.
- **Disaster and atrocity sites.** No capture mechanic, no rarity, no collection prompts.
  Where it would be wrong to gamify, the mechanics are switched off, not merely muted.
- **Living communities.** A neighbourhood's difficult history is told by people who live
  there wherever possible — this is what `partner` provenance is for.

**Rule:** where a place is somebody's grief, it is not a collectible.

---

## Outside the US

The first routes are American. These differences are large enough to change the product,
not just the paperwork.

**England and Wales.** Considerably more claimant-friendly. The burden effectively sits with
the publisher to prove truth, and there is no equivalent of the US public-figure standard.
Fair report privilege exists but is narrower. **A true-crime library that is safe in the US
may not be publishable in the UK.**

**EU / GDPR.** Naming a living person in published content is processing their personal
data, engaging lawful-basis and erasure obligations that have no US analogue. There is a
recognised journalistic exemption, and whether we qualify for it is a real question rather
than a formality.

**Right to be forgotten.** A person named in a crime story may be able to compel removal in
the EU even where the account is accurate. The library needs to support removal of an
individual echo on request, and it does.

### For the lawyer
13. Do we qualify for the journalistic exemption under GDPR?
14. Should the true-crime collection be geo-restricted rather than geo-*targeted* — carried
    only in jurisdictions where it is defensible?

---

## What is already enforced in code

Not policy that lives in a document nobody reads. CI fails the build on each of these:

| Rule | Where |
|---|---|
| Public-domain / CC-BY sources only | `MVP_POLICY` |
| True crime needs a primary public record | `validateTrueCrime` |
| Three sources for a living unconvicted person | `validateTrueCrime` |
| Conviction status stated explicitly | `TrueCrimeReview` |
| A named human reviewer | `TrueCrimeReview.reviewedBy` |
| Legend cannot claim to be documented | `certainty` |
| Contributions are never true crime | `checkContribution` |
| Contributions carry no contact details | `checkContribution` |
| Contributions are always attributed | `checkContribution` |
| Reported content hides immediately | `checkEligibility` |
| No advertising to under-13s | `validateSponsorship` |

---

## Before the lawyer meeting

Bring: this document, `docs/adr/0006-public-domain-only.md`, `docs/adr/0013-contributions.md`,
and three sample true-crime scripts including one involving a living person.

Ask, in priority order:

1. **Airline indemnification.** Who indemnifies whom. No sourcing policy touches this, and
   it is the one that costs real money if it is wrong.
2. **The primary-record rule** — does it hold across the states our first routes cross?
3. **DMCA and Section 230 posture** for contributions, before that feature opens.
4. **Media liability insurance** — needed, and at what point?
5. **UK and EU** — restrict, or adapt?
