# Writing an echo

Someone stood at Bowling Green, heard the king-statue echo, and wanted the next one. That
is the bar, and this document exists so the twentieth echo clears it as reliably as the
first — because the failure mode is not a bad echo, it is twenty adequate ones.

Everything here is derived from what made that one work.

---

## The test

**Would a stranger take the next twenty steps to hear the next one?**

Not "is this accurate", not "is this interesting". Accuracy is a floor, not a standard, and
plenty of accurate things are boring. If an echo would not make someone keep walking, it
does not go in, however well sourced.

---

## What an echo is not

**It is not an encyclopedia entry read aloud.** This is the failure mode, and it is what an
AI draft produces by default:

> Bowling Green is the oldest public park in New York City, established in 1733. It is
> located at the southern end of Broadway. The park features a fence erected in 1771, which
> is designated a New York City landmark.

Every word is true. Nobody has ever wanted to hear a second one of those.

---

## The six things that make one work

### 1. Open with something they can do
The first line of the Bowling Green echo is *"the fence around it has been here since
1771"*, and the second is *"look at the tops of the posts"*. Within ten seconds the listener
is looking at a real object.

A listener who is *looking at something* is inside the story. One who is being told facts is
listening to a podcast, and a podcast does not need them to be standing there.

### 2. Withhold
Do not front-load the conclusion. *"Look at the tops of the posts"* comes a full thirty
seconds before the explanation of what is missing from them. That gap is the reason to keep
listening.

The instinct to summarise first is a newspaper instinct. This is closer to a joke: setup,
then payoff.

### 3. Anchor it to something present *now*
The strongest detail in that echo is not the statue being torn down in 1776. It is that the
crowns are **still missing from the fence they are standing next to**, 250 years later.

Every echo needs at least one thing the listener can verify with their own eyes. Without it,
they might as well be at home.

### 4. One idea, not a survey
Castle Clinton has been a fort, a theatre, a beer garden, an immigration depot, an aquarium
and a monument. The echo is about **eight million people walking through a door**. The rest
is one sentence at the end.

Two ideas is one too many. If the second one is good, it is a second echo.

### 5. Land it
*"Which is a fairly direct way of making a point."*
*"If your connection dies tonight, this is the good outcome."*

The last line should do something — reframe, undercut, or sit still. It must not summarise.
A summary tells the listener the story is over; a landing tells them it meant something.

### 6. Specifics, not scale
"Three and a half tonnes of bronze, left outside the Stock Exchange in the middle of the
night" beats "a famous sculpture". "Twenty-two feet of snow" beats "severe weather".

Concrete beats impressive. A number only earns its place if it is surprising: *eight
million* does, *established in 1733* does not.

---

## Things that kill an echo

| | Instead |
|---|---|
| Opening with a date | Open with something to look at. The date can come later, if it earns it. |
| Listing what a place has been | Pick one, tell it properly |
| "Little did they know" | Trust the material |
| A dramatic voice doing the work | The facts should be startling on their own |
| Explaining the significance | Show the thing; significance is the listener's job |
| Three names in the first sentence | One, if any |
| "Fun fact:" | If it needs announcing, it isn't one |
| Ending on a summary | End on a turn |

---

## Shape by length

**30 seconds — look below.** One fact, one image, out. No structure needed. *"Nobody
commissioned this."*

**90 seconds — short.** Setup, withhold, payoff, land. The Bowling Green shape, and the
workhorse of a walking tour.

**3 minutes — feature.** Room for two beats before the payoff, or one character. Needs a
reason to be longer than 90 seconds, and "there was more information" is not one.

**10 minutes — deep.** Only for a story that is genuinely a story: people, change, an
ending. Most subjects cannot sustain this and should not try.

---

## Writing for the ear

It will be read aloud by a synthetic voice. That changes things.

- **Short sentences.** A clause a reader can re-scan, a listener cannot.
- **Paragraph breaks are breaths.** Use them where a narrator should pause.
- **Numbers as words.** "Eight million", not "8,000,000". "The ninth of July", not "July 9".
- **No parentheses, no semicolons.** They have no sound.
- **Say the hard names out loud** before writing them down, then put a note in
  `pronunciations`. Duane, Zenger, Di Modica.
- **Read the draft aloud yourself.** Every flat line is audible immediately and invisible on
  the page.

---

## Truth, in practice

The editorial gates are in `docs/protection-policy.md` and enforced in CI. Three points
that bear on the *writing* rather than the sourcing:

- **Hedge in the script, not in the metadata.** If the record is unclear, the narration says
  so: "by most accounts", "the story goes". A `certainty` field the listener cannot hear is
  not a disclosure.
- **A legend is more fun when labelled.** "There is no record of this, and people have been
  telling it since the 1890s" is a better line than pretending.
- **Never smooth an inconvenient fact.** If the interesting version is not the true one,
  write the true one, and find the interest elsewhere. It is always there.

---

## A worked example

Subject: the African Burial Ground.

**Bad open.** *"The African Burial Ground National Monument is a national monument in Lower
Manhattan, designated in 2006."* Accurate. Inert.

**The open we used.** *"In 1991 the federal government began digging foundations for an
office tower at Broadway and Duane, and about seven metres down the crews found bone."*

Same facts. It begins with an event, gives the listener a depth they can picture, and stops
on a word that makes them wait.

Then: withhold (what *was* it?), anchor to now (you are standing at the edge of the old
town boundary), one idea (fifteen thousand people, built over and forgotten), land
(*"You are standing at the edge of town."*)

---

## Before it ships

1. Read it aloud. Whole thing, out loud.
2. Is there something to look at in the first fifteen seconds?
3. Is there one idea, or two?
4. Does the last line turn, or does it summarise?
5. Would a stranger walk another twenty steps for the next one?

If five is a no, it does not ship. There is no quota, and a thin library of strong echoes is
worth more than a full one of adequate ones — a listener who hears two dull echoes in a row
stops trusting the app and never hears the third.
