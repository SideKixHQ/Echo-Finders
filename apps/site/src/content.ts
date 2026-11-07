/**
 * All of the site's words and photos live in this file.
 * Change the text here and every page updates.
 *
 * Photos are free-to-use images from Unsplash (unsplash.com/license).
 * To swap one, replace the photo ID in the `photo(...)` call.
 */

export const photo = (id: string, width = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=70`;

/** The web app itself. Every "Get the app" button opens it. */
export const APP_URL = 'https://echo-finders.vercel.app/';

/** General contact, shown in the footer and on the pricing section. */
export const CONTACT_EMAIL = 'hello@echofinders.com';

export const images = {
  homeHero: photo('photo-1704474596984-2f64fd1fdc62', 2000),
  howItWorks: photo('photo-1668277140098-e53ff8f28d50', 1000),
  partners: photo('photo-1786511811581-36b2a062aa31', 1400),
  capeFear: photo('photo-1652041227274-0aca10aff554', 2000),
  closing: photo('photo-1472162167628-0875e2780d0b', 2000),
  partnerHero: photo('photo-1642843218043-97667c7f661f', 2000),
};

export const home = {
  hero: {
    kicker: 'A location-based audio storytelling app',
    titleLine1: 'Stand where it happened.',
    titleAccent: 'Hear the Echo.',
    subtitle:
      'Short, location-triggered stories — called Echoes — that reveal the people, mysteries, and moments that give a place its character, playing right where you stand.',
    primaryCta: 'Get the app',
    secondaryCta: 'Partner with us',
    scrollHint: 'Scroll to begin the walk',
    coordinates: '34.2257° N · 77.9447° W',
  },
  how: {
    kicker: 'How it works',
    title: 'Every corner keeps a story.',
    intro: 'Echo Finders connects people with the places around them. Walk slowly, and the town starts talking.',
    steps: [
      {
        id: 'step-1',
        index: '01',
        timestamp: '0:00',
        title: 'Stand somewhere',
        body: 'A street corner. An old theater. A quiet stretch of beach. Echo Finders knows where you are — and what happened right there.',
      },
      {
        id: 'step-2',
        index: '02',
        timestamp: '0:47',
        title: 'An Echo awakens',
        body: 'A glowing pin rises on your map as you arrive. Step inside its radius and the story surfaces, ready to play.',
      },
      {
        id: 'step-3',
        index: '03',
        timestamp: '1:07',
        title: 'Hear the story',
        body: 'Most Echoes run about a minute. The people, events, and mysteries of this exact spot — researched, sourced, and told where they belong.',
      },
    ],
  },
  echoes: {
    kicker: 'Echoes',
    title: 'Nine ways to listen closer.',
    intro:
      'History, people, buildings, the land itself, food, art, legends, true crime, and the places where something famous began. Choose the ones you want, and the map plays only those.',
    categories: [
      {
        id: 'cat-history',
        image: '/fort-fisher.jpg',
        imageAlt: 'Fort Fisher, North Carolina, photographed in 1865',
        name: 'History',
        tag: '01 · Foundations',
        tease: 'The moments that made the map.',
      },
      {
        id: 'cat-people',
        image: photo('photo-1786511811581-36b2a062aa31', 1200),
        imageAlt: 'A wooden boardwalk lit by warm lights at dusk',
        name: 'People',
        tag: '02 · Lives',
        tease: 'Who lived here, worked here, and changed the street.',
      },
      {
        id: 'cat-built',
        image: photo('photo-1771582546923-c38ede3be5c6', 1000),
        imageAlt: 'Old brick buildings lit up at night',
        name: 'Built',
        tag: '03 · Structure',
        tease: 'Why a building is the shape it is.',
      },
      {
        id: 'cat-land',
        image: photo('photo-1625180940731-ea06b588d292', 1000),
        imageAlt: 'Marsh grass silhouetted against a sunset',
        name: 'Land',
        tag: '04 · Wild',
        tease: 'Dunes, marshes, storms, and why the town is where it is.',
      },
      {
        id: 'cat-food',
        image: photo('photo-1758957097741-fea28cb227b4', 1000),
        imageAlt: 'A chef cooking behind a counter in warm light',
        name: 'Food & Drink',
        tag: '05 · Table',
        tease: 'Recipes with a past, and the kitchens that kept them.',
      },
      {
        id: 'cat-arts',
        image: photo('photo-1704474596984-2f64fd1fdc62', 1000),
        imageAlt: 'A historic street glowing at dusk',
        name: 'Arts',
        tag: '06 · Craft',
        tease: 'Where it was written, recorded, painted, or first performed.',
      },
      {
        id: 'cat-inspo',
        image: photo('photo-1631805249874-3f546d176de4', 1000),
        imageAlt: 'A theater marquee glowing at night',
        name: 'Inspo',
        tag: '07 · Origins',
        tease: 'The set, the room, the moment where something famous began.',
      },
      {
        id: 'cat-legends',
        image: photo('photo-1627718725000-8d47e8ff6354', 1000),
        imageAlt: 'A lighthouse glowing at night near the water',
        name: 'Legends',
        tag: '08 · Whispers',
        tease: 'Ghost lights and buried treasure, always told as legend.',
      },
      {
        id: 'cat-true-crime',
        image: photo('photo-1648504149855-26e9fe360dea', 1000),
        imageAlt: 'A dark street at night under street lights',
        name: 'True Crime',
        tag: '09 · Evidence',
        tease: 'The cases a town never forgot. Off until you turn it on.',
      },
    ],
  },
  mapMock: {
    title: 'Downtown Wilmington — tonight',
    nowPlaying: 'Now playing',
    nowPlayingTitle: "Ellen Bellamy's Long View",
    nowPlayingTime: '1:08',
    pinLabels: [
      { id: 'pin-a', label: 'Cotton Exchange · 0:32' },
      { id: 'pin-b', label: 'Bellamy Mansion · 1:08' },
      { id: 'pin-c', label: 'Riverwalk · 1:06' },
    ],
  },
  app: {
    kicker: 'The experience',
    title: 'Built for wandering.',
    features: [
      {
        id: 'feat-map',
        title: 'Discover on the map',
        detail: 'MAP VIEW',
        body: 'Echoes appear as living pins across a dark, quiet cartography of the town — the closer you stand, the louder they get.',
      },
      {
        id: 'feat-interests',
        title: 'Follow your interests',
        detail: 'FOLLOW',
        body: 'True crime on Tuesday, harbor history on Saturday. Choose your threads and the map tunes itself to you.',
      },
      {
        id: 'feat-web',
        title: 'Nothing to install',
        detail: 'IN YOUR BROWSER',
        body: 'Open it on your phone and start walking. Add it to your home screen if you like — no app store, no account to begin.',
      },
      {
        id: 'feat-kids',
        title: 'Made for younger ears, too',
        detail: 'FAMILY',
        body: 'Selected Echoes are adapted for kids, so the whole walk can listen together.',
      },
    ],
  },
  pricing: {
    kicker: 'Pricing',
    title: 'Your first ten Echoes are free.',
    intro: 'Listen to ten anywhere, no account and no card. When you want the rest of a place, pick the pass that fits the trip.',
    plans: [
      {
        id: 'plan-week',
        name: 'Week Pass',
        price: '$3.99',
        per: 'for 7 days',
        body: 'Every Echo in one region for a week. Bought once, nothing to cancel. Upgrade to a City Pass within the week and the $3.99 counts.',
      },
      {
        id: 'plan-city',
        name: 'City Pass',
        price: '$9.99',
        per: 'once',
        body: 'Every Echo in one region, for good. One payment, no renewal.',
        featured: true,
      },
      {
        id: 'plan-all',
        name: 'All-Access',
        price: '$34.99',
        per: 'a year',
        body: 'Every region, every Echo, as new places open. Renews yearly; cancel any time.',
      },
    ],
    region: 'Now open: the Cape Fear Coast — Wilmington, Wrightsville Beach, Carolina Beach, Kure Beach, Fort Fisher, Southport, Oak Island, and Topsail.',
    note: 'Prices in US dollars. Payments by Stripe.',
    cta: 'Start listening free',
  },
  partners: {
    kicker: 'For partners',
    title: 'Bring the stories of your place to life.',
    body: [
      "Echo Finders works with municipalities, tourism organizations, museums, historians, and local businesses to put a community's stories where they happened — in visitors' ears and residents' routines.",
      'Together we build destination collections that give people a reason to linger one more block, one more hour, one more day.',
    ],
    audiences: 'Municipalities · Tourism organizations · Museums · Historians · Local businesses',
    offers: [
      { id: 'offer-collections', name: 'Destination collections', body: 'Curated Echoes that turn a stroll into an itinerary.' },
      { id: 'offer-passes', name: 'Paid destination passes', body: 'Premium collections that fund the work and keep the free map generous.' },
      { id: 'offer-distribution', name: 'Partner distribution', body: 'Your stories, delivered through the app, your channels, and your visitor centers.' },
      { id: 'offer-sponsorships', name: 'Labeled sponsorships', body: 'Support that is always clearly labeled — never woven into the story itself.' },
    ],
    integrity: 'The integrity promise: the stories stay honest. Sponsorship never rewrites history.',
    cta: 'Partner with us',
  },
  capeFear: {
    kicker: 'Where we begin',
    title: 'Starting in the Cape Fear region.',
    body: [
      "From the riverwalk to the battleship, from haunted alleys to salt marsh sunsets — we're building destination collections and local partnerships that make exploration around Wilmington more meaningful.",
      'One Echo at a time, the map grows.',
    ],
    mapping: 'Now mapping — Wilmington · Wrightsville Beach · Carolina Beach · Southport',
    coordinates: 'Cape Fear River · Wilmington, North Carolina',
  },
  closing: {
    title: 'Be where it happened.',
    accent: 'Hear the Echo.',
    body: 'Echo Finders turns the places around you into stories you can hear.',
    appCta: 'Get the app',
    partnerCta: 'Partner with us',
    coordinates: 'END OF TRAIL · 34.2257° N · 77.9447° W',
  },
};

export const partner = {
  hero: {
    kicker: 'For municipalities, tourism organizations, museums, historians, and local businesses',
    titleLine1: 'Bring the stories of',
    accent: 'your place to life.',
    subtitle:
      "Echo Finders turns a community's stories into location-triggered audio walks — destination collections that give people a reason to linger one more block, one more hour, one more day.",
    cta: 'Start a partnership',
    coordinates: '34.2257° N · 77.9447° W',
  },
  who: {
    kicker: 'Who we partner with',
    title: 'Built for the keepers of place.',
    intro:
      "The people and institutions who already hold a place's stories — we help them carry those stories to everyone who walks through.",
    audiences: [
      {
        id: 'aud-municipalities',
        title: 'Municipalities',
        body: 'Give visitors a reason to explore beyond the obvious stops — and give residents a new way to know their own city.',
      },
      {
        id: 'aud-tourism',
        title: 'Tourism organizations',
        body: 'Turn a day trip into a story-driven itinerary, with passes that fund the next season of Echoes.',
      },
      {
        id: 'aud-museums',
        title: 'Museums',
        body: 'Take the collection beyond your walls — a museum trail that starts at the front door and ends three blocks from it.',
      },
      {
        id: 'aud-historians',
        title: 'Historians',
        body: "Your research deserves an audience. Record the stories you've spent a career gathering, told where they happened.",
      },
      {
        id: 'aud-businesses',
        title: 'Local businesses',
        body: "Be the echo. If your business keeps a story — a recipe, a ghost, a hundred-year habit — we'll help it travel.",
      },
    ],
  },
  offerings: {
    kicker: 'How we work together',
    title: 'Ways to partner.',
    intro: 'Four ways to work with us — start with one, or combine them into a destination program.',
    items: [
      {
        id: 'offer-collections',
        detail: '01',
        title: 'Destination collections',
        body: 'Curated Echoes that turn a stroll into an itinerary. We map, research, and record the stories of your streets, landmarks, and hidden corners — then publish them where they happened.',
      },
      {
        id: 'offer-passes',
        detail: '02',
        title: 'Paid destination passes',
        body: "Premium collections that fund the work and keep the free map generous. Visitors buy a pass to unlock a destination's full collection — you share in the revenue.",
      },
      {
        id: 'offer-distribution',
        detail: '03',
        title: 'Partner distribution',
        body: 'Your stories, delivered through the app, your channels, and your visitor centers. QR codes, co-branded maps, and social features that meet visitors where they arrive.',
      },
      {
        id: 'offer-sponsorships',
        detail: '04',
        title: 'Labeled sponsorships',
        body: 'Support the map, get the credit. Sponsorships are always clearly labeled — never woven into the story itself. The integrity promise below is non-negotiable.',
      },
    ],
  },
  process: {
    title: 'From first walk to launch.',
    steps: [
      {
        id: 'process-1',
        index: '01',
        title: 'Map it',
        body: 'We walk your destination together — streets, landmarks, overlooked corners — and agree on the story threads worth recording.',
      },
      {
        id: 'process-2',
        index: '02',
        title: 'Record it',
        body: 'We research each story from the record, check every fact against a source, and produce each Echo with you before it goes live.',
      },
      {
        id: 'process-3',
        index: '03',
        title: 'Launch it',
        body: 'The collection goes live on the map with launch support: visitor center materials, co-branded promotion, and impact reporting.',
      },
    ],
  },
  sponsorship: {
    kicker: 'The integrity promise',
    title: 'Support that is always labeled.',
    body: [
      'Every Echo stands on its own as honest storytelling. Sponsors make more of them possible — and get their name on the collection page, the launch materials, and the partner map. Never in the story.',
      'A sponsored collection reads exactly like an independent one: researched locally, written for the ear, and anchored to the place where it happened.',
    ],
    promise: 'The stories stay honest. Sponsorship never rewrites history.',
  },
  form: {
    kicker: 'Partner inquiry',
    title: 'Start the conversation.',
    intro:
      "Tell us a little about your place and what you're imagining. We review every inquiry personally and reply within a few days — usually with questions, occasionally with a site visit.",
    note: 'Prefer email? Write to partners@echofinders.com and the same conversation starts.',
    email: 'partners@echofinders.com',
  },
};
