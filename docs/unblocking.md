# The two blockers, and how to clear them

Both are about this session's environment reaching the outside world. Neither is hard, and
**neither is required** — there is a path below that needs no configuration at all.

---

## Blocker 1 — research sources

I can search the web, but I cannot *open* a page. So I can find that Castle Clinton opened
as an immigration depot in 1855, and I cannot read the National Park Service page that says
so. Citing a source I have not read is exactly the failure the Truth value exists to
prevent, which is why all six echoes sit at `factCheck: unchecked`.

### Option A — open the allowlist (best)
In Claude Code on the web, find the environment this session runs in and edit its **network
access** settings. Add:

```
nps.gov
loc.gov
si.edu
wikidata.org
nycgovparks.org
api.elevenlabs.io
```

Docs: https://code.claude.com/docs/en/claude-code-on-the-web

### Option B — paste the sources (works right now)
Open the NPS page yourself and paste the text into the chat. I verify against what you
pasted, which is a real source I have actually read. Slower per echo, no setup, and good
enough to get the first few approved today.

---

## Blocker 2 — rendering audio

### The safe path: run it on your machine

`scripts/render-echo.mjs` calls ElevenLabs and writes the audio plus measured transcript
timings. **Run it locally so your API key never leaves your computer.**

```bash
git clone https://github.com/SideKixHQ/Echo-Finders
cd Echo-Finders
git checkout claude/charming-fermat-tyx9q6
npm install
npm run build --workspace @echofinders/core

export ELEVENLABS_API_KEY=sk_...        # from elevenlabs.io → your profile → API key
node scripts/render-echo.mjs content/echoes/history/bowling-green-king-george.yml
```

It writes the audio to `content/audio/<echo-id>/<voiceId>.mp3` — play it — and a
`renders:` block to paste into the echo's YAML file.

Add the male voice with a second argument:

```bash
node scripts/render-echo.mjs content/echoes/history/bowling-green-king-george.yml hP72SDESIJq2YuAblBqz
```

### Why not just give me the key?

A key pasted into a chat is a key in a transcript, and it is one that can spend your money.
If you would rather I ran it here, put it in the **environment's variables** in the
environment settings — never in a message — and add `api.elevenlabs.io` to the allowlist.

### What the script does that matters

It uses the `/with-timestamps` endpoint, which returns **character-level timings** with the
audio. So the transcript gets measured line timings rather than estimates from word count,
which drift badly over a ten-minute echo and desynchronise read-along.

It also applies the echo's pronunciation notes before sending — "Duane" goes out as
"doo-AYN" — while keeping the original words in the transcript, which is what a reader
should see.

---

## What to listen for

This is the first time the writing will have been heard, and it is the actual product.

- Does it sound like a person, or like a list of facts?
- Do the pauses land? Paragraph breaks in the script become breaths.
- Are the place names right? Duane, Zenger, Di Modica are the ones to watch.
- Is it too long? A ninety-second echo should feel brief.
- Would you keep walking to hear the next one?

If the answer to the last question is no, that is the most valuable thing we could learn
today, and no amount of further engineering fixes it.
