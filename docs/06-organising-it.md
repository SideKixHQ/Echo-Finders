# Making it easy, intuitive and fun

*Echo Finders is a Whatishere.com product.*

Written after screenshotting all twenty-two screens in sequence and looking at them, which
is not something anybody had done. Every individual fix in the last few days was a correct
answer to a real complaint. The result is still not good, and this is why.

## The diagnosis: the map screen has eleven jobs

Count what is competing on one screen, from the top:

1. Change your journey (the header)
2. Filter by category (eight chips, scrolling)
3. See where you are (the map, or the rose)
4. See what is around you (pins, and again as a list)
5. Walk to one (the beacon)
6. Play something (the orb)
7. Control playback (transport, speed, skip, stop)
8. Read the transcript (a tab)
9. See what you saved (a tab)
10. Track progress ("0 synced · 12 to go")
11. Kids mode, light mode, speed, recentre, download (five rail buttons)

One screen. And the clearest symptom of it: **swipe the sheet up and the same echo appears
twice**, once in the now-playing row and again as the first card in the list below, with a
second list called "Coming up" in between in a different visual style.

This is accretion, not design. Every piece of it was added because something was missing.
Nothing was ever removed, and nobody asked what the screen was *for*.

## The product is three verbs

Strip it back and the whole thing is:

**Find** something. **Hear** it. **Keep** it.

And the thing that matters most about those three: **they are sequential, not parallel.** You
are never hunting and listening at the same time; the hum is silenced during narration
precisely because they compete. You are never listening and browsing your collection. So the
app should be one thing that *changes state*, not one thing with tabs for all its states at
once.

That is the mistake the tab strip makes. "Around you / Transcript / Saved" offers three
things when the situation only ever wants one, and it makes the person choose when the app
already knows.

## The proposal

### Two tabs, not three

**Map** and **Yours**. Settings is a gear on the map, not a peer of the thing the app is for.

Yours is a genuinely different session: you are at home on the sofa, not out in the street.
That earns a tab. Settings does not.

### The sheet has no tabs. Its content is the state you are in

| State | The sheet is | Swipe up gets you |
| --- | --- | --- |
| Hunting | the nearest echo, and what to do about it | what else is around, as **one** list |
| Listening | the player | the transcript |

Nothing to choose, because in each state there is only one useful thing. This deletes the
tab strip, the duplicate "Coming up" list, and the Saved tab, whose contents belong in Yours
where you would actually go looking for them.

### The rail is two buttons

Recentre, and the journey. Kids mode and light mode are settings that somebody sets once and
never touches again, and they are sitting in the most valuable column on the screen. Speed
belongs with the transport, where speed already is.

### Delete the guidance pill

"You're here · right here" is a third voice saying what the map's radius ring shows and the
row below states in metres. Three ways of saying one thing is how a screen stops meaning
anything. The hum says it better than all three.

### Progress moves to Yours

"0 synced · 12 to go" is a fact you look up, not one you need while walking. It belongs on
the screen about your collection.

## What that leaves

A hunting screen with: where you are, what is around you, one row saying what is nearest, and
two buttons. Then a listening screen that is the same screen with the bottom turned into a
player. Then a collection.

Everything currently on the map screen that is not one of those either moves or goes.

## On fun, which is the part nobody has worked on

Easy and intuitive are subtraction problems and the list above is the subtraction. Fun is not,
and right now this app is not fun, because the three things that would make it fun are all
built and all invisible.

**The hum is the best idea in the product and it is behind a button most people will never
press.** It should be what happens when you start walking, offered once, plainly: headphones
in, and the street starts humming. Not a toggle on a dial you have to find.

**Rarity exists and nobody sees it.** The engine computes it, the tag says "Synced · rare",
and it appears for a moment in a row most people never look at. A collection is only fun if
some of it is hard to get. Rarity should be visible while hunting, on the map, before you
walk there: this one is common, this one almost nobody has stood on.

**The reveal is the moment and it is not treated like one.** Standing on a spot and having a
sealed echo resolve out of noise is the thing this product does that nothing else does.
Today it happens quietly and a card changes state. It should be the most deliberate two
seconds in the app.

None of those three needs new mechanics. All three are already built and under-displayed,
which is the cheapest kind of improvement there is.

## What I would do, in order

1. **Subtract.** The tab strip, the duplicate list, the guidance pill, three rail buttons,
   the progress line. Nothing new, and the screen becomes legible.
2. **Make the sheet follow the state** rather than offering a choice.
3. **Two tabs**, with settings behind a gear.
4. **Then** the three fun things, in this order: the hum offered by default, rarity visible
   while hunting, the reveal given its two seconds.

One and two are most of the win and are pure deletion, which is also the least risky work
there is. Nothing in the engine changes for any of it.
