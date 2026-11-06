# Competitive landscape: "Untappd for ice cream" and adjacent check-in/rating apps

Research date: 2026-11-06. Method note: WebFetch was blocked in this session for wikipedia.org, play.google.com, icecreamratings.com and dipt.app (DNS not allowed), so most findings below come from search-result summaries rather than full page reads. Figures from third-party trackers (GummySearch, Tracxn, ECDB, appfollow, etc.) are estimates and are flagged as such.

## Ice cream / frozen dessert specific apps (past and present)

### Takeaway
The space is crowded with small, mostly indie or very early apps (Scooped, The Scoop, Treatly, dipt, Rate My Scoop, IceCreamRatings), and none has visible scale, funding or press coverage. No ice cream app has broken out the way Untappd (beer) or Vivino (wine) did. I found no documented shutdown post-mortems either. Most of these apps seem to stay small and quiet rather than fail publicly.

### Cited Findings
- **Scooped: IJs & Gelato** (Netherlands-based developer, Dutch and English): built for visits to artisanal and independent parlours. Users find nearby parlours, log each flavour tasted, rate a flavour separately from the parlour, follow friends and share a map. It launched in the Netherlands. — [Google Play listing (via search summary)](https://play.google.com/store/apps/details?id=app.scooped.mobile)
- Scooped's own text claims more than 5,000 parlours across 16 countries, though its focus is the Netherlands. — [Google Play listing (via search summary)](https://play.google.com/store/apps/details?id=app.scooped.mobile)
- **The Scoop: Ice Cream App** (US; scoopapp.io): users post photos, rate flavours, review shops and see live ratings on a map. It offers "a free scoop for your first review", a shop-partnership acquisition hook. Personalised flavour recommendations are listed as "coming soon". — [scoopapp.io](https://scoopapp.io/); [Google Play](https://play.google.com/store/apps/details?id=com.thescoop.mobile&hl=en_US)
- A separate site, **eatthescoop.com** ("the scoop — ice cream shop reviews"), also exists. It is unclear whether it is related to The Scoop app. — [eatthescoop.com](https://www.eatthescoop.com/)
- **Treatly** (iPhone): a dessert/ice cream journal. Users log every cone, cup or sundae with a photo, a 1–5 star rating and flavour notes. It has a map of parlours visited and stats such as top flavours and unique shops tried. Listed as free. It also markets itself as "Letterboxd for food" through SEO landing pages. — [treatly.app](https://www.treatly.app/best-ice-cream-journal-app); [treatly.app Letterboxd page](https://www.treatly.app/apps-like-letterboxd-for-food/)
- **dipt**: a craft ice cream app with a shop locator, flavour finder, ratings and reviews, and ice cream events. No traction data was found. — [dipt.app](https://www.dipt.app/)
- **Rate My Scoop**: a web-based "artisanal ice cream logbook" for tracking and rating flavours. No platform, pricing or traction details were found. — [rate-my-scoop.com](https://rate-my-scoop.com/)
- **IceCreamRatings.com** calls itself "the world's largest ice cream community", with a database of about 10,000 ice creams (mostly packaged products) that members rate to build a "personal freezer". This is the closest existing analogue for rating pints and packaged products. — [icecreamratings.com (via search summary)](https://icecreamratings.com/)
- **Ice Cream Journal – Scoop** (iOS): for people who make ice cream at home. It logs batches with recipe details and a 4-star tasting rating, and sorts flavours into "Keepers" and "To Try". It is adjacent, serving the homemade/Ninja Creami crowd. — [App Store](https://apps.apple.com/us/app/ice-cream-journal-scoop/id6786448664)
- Brand tools: Ben & Jerry's publishes flavour listings (including scoop-shop flavours) on its site, but I found no evidence of a Ben & Jerry's flavour-rating or check-in app. — [benjerry.com](https://www.benjerry.com/flavors/ice-cream-shop-flavors)
- No Product Hunt listing or shutdown news for an ice cream rating app came up in an extended search. — [search result set incl. The Scoop/Scooped listings](https://play.google.com/store/apps/details?id=com.thescoop.mobile&hl=en_US)

### Inferences
- Two distinct product shapes recur: (a) **scoop-shop and flavour-at-shop** logging (Scooped, The Scoop, dipt, Treatly) and (b) **packaged pint** rating (IceCreamRatings). No one clearly does both well. Untappd's model covers both, since bottles are rated at bars and at home.
- The scoop-shop variant has a hard data problem. Shop flavours rotate daily or seasonally, unlike beer SKUs, so a stable "flavour catalog" like Untappd's beer database is harder to build. The Scoop and Scooped both rate flavours as children of a shop, which looks like the pragmatic answer.
- The many lookalike indie apps (several apparently launched 2024–2026, some with SEO-content marketing) suggest a low barrier to entry and no moat yet. Distribution, not features, is the open problem.

### Gaps
- Download counts, ratings counts, launch dates, founders and funding for Scooped, The Scoop, Treatly, dipt and Rate My Scoop could not be verified, because app-store pages could not be fetched.
- I found no named, dead ice cream check-in apps with post-mortems. Names like "Licks", "Sundae" and "IceCreamCrawl" returned no relevant results.
- I did not verify whether IceCreamRatings has a mobile app, who runs it, or its user count.

## Adjacent "Untappd for X" apps: mechanic, monetization, scale, outcome

### Takeaway
The winners (Untappd, Vivino, Beli) pair a fast, fun logging mechanic with a large structured catalogue and later monetize through B2B tools, commerce or both. Small-category apps (Distiller, Delectable, Beanconqueror) stay niche or get acquired by content and media players. Beli is the most relevant modern template: its pairwise-ranking mechanic produced fast Gen Z growth.

### Cited Findings
**Untappd (beer)**
- Acquired by Next Glass in 2015/Jan 2016 (sources differ on the date) and kept as a subsidiary. Next Glass then bought BeerAdvocate (2020), Oznr/CraftCellr e-commerce (2020), Hop Culture magazine (Dec 2020) and Ollie and Fermentable (2021). This is a roll-up toward B2B (venue menus, wholesale) and commerce. — [Next Glass About](https://nextglass.co/about-us); [Paste](https://www.pastemagazine.com/drink/craft-beer/untappds-parent-company-has-acquired-beeradvocate); [Brewbound – Ollie](https://www.brewbound.com/news/untappd-parent-company-acquires-canadian-omnichannel-marketplace-ollie-order/); [PorchDrinking 2016](https://porchdrinking.com/articles/2016/01/15/next-glass-acquires-untapped-in-symbiotic-merger/)
- Scale: 500M check-ins milestone (2017 blog post). Roughly 3M users in 2016, and later "approximately 9 million users" with 900M+ check-ins (undated). U.S. check-ins fell from 89.1M to 67.4M in 2021, while non-U.S. check-ins went from 63.8M to 64.1M. — [Untappd blog](https://blog.untappd.com/post/165869743736/cheers-to-500000000-check-ins); [ExpandedRamblings](https://expandedramblings.com/index.php/untappd-statistics-facts); [Good Beer Hunting](https://www.goodbeerhunting.com/sightlines/2021/2/23/how-untappd-ratings-became-craft-beers-most-fickle-prize)
- Untappd ratings became a "fickle prize" for craft breweries, so the producer side cares about scores. — [Good Beer Hunting](https://www.goodbeerhunting.com/sightlines/2021/2/23/how-untappd-ratings-became-craft-beers-most-fickle-prize)

**Vivino (wine)**
- Label-scanning check-ins and a marketplace. The CEO's 2024 recap reported 71M+ registered users and 200,000+ Premium subscribers. Another listing says 65M users, so figures are inconsistent. — [search summary of Vivino sources incl. ExpandedRamblings](https://expandedramblings.com/index.php/vivino-facts-statistics)
- Revenue is not published. ECDB estimates 2025 GMV at about US$491M. Revenue estimates range widely (Techlist $59M; Owler $100–500M). Marketplace sales reportedly more than doubled in 2020 to $265M. Commission rates (about 15% market, 10% checkout) come from an unverified third-party overview. — [ECDB](https://ecdb.com/resources/sample-data/retailer/vivino); [Techlist](https://techlist.ai/vivino.com); [Silicon Valley Investclub](https://siliconvalleyinvestclub.com/ar/companies/vivino/); [Vizologi](https://vizologi.com/business-strategy-canvas/vivino-business-model-canvas/)
- Raised a US$155M Series D. Earlier, it raised $20M as "its ecommerce business takes off". — [Global Venturing](https://globalventuring.com/university/vivino-pours-155m-into-series-d/?format=md); [VentureBeat](https://venturebeat.com/ai/wine-discovery-app-vivino-raises-20-million-as-its-ecommerce-business-takes-off)

**Delectable (wine)**
- A label-scanning social wine app, acquired with sister app Banquet by Antonio Galloni's Vinous Media in Dec 2016. Terms were undisclosed. Enthusiast forums later debated "how irrelevant has the Delectable app become". — [App Developer Magazine](https://appdevelopermagazine.com/vinous-acquires-delectable-and-banquet-wine-apps/); [Vinography](https://www.vinography.com/2016/12/wine_app_wars_continue); [WineBerserkers](https://www.wineberserkers.com/t/how-irrelevant-has-the-delectable-wine-app-become/165052)

**Distiller (spirits)**
- Founded in 2013. It blends expert and user scores, has nearly 60,000 spirits, and offers flavour graphs. Free, with a Pro tier (barcode scanner, export, newsletter). Third-party estimates: about 6K iOS ratings at 4.7★, about 19K MAU, and about 347K Android installs. I found no evidence of an acquisition. — [App Store](https://apps.apple.com/app/distiller/id784925833); [The Spirits Business 2015](https://www.thespiritsbusiness.com/2015/12/distiller-2-0-app-extends-scope-of-spirits-reviews/); [appfollow](https://appfollow.io/ios/distiller/784925833?country=us)

**Coffee**
- Beanconqueror: a free, open-source brew-tracking app (grind, dose, time) with Bluetooth scale integrations. It has a 4.9★ App Store rating from only 135 ratings, an unverified "42K+ users" claim, and is developed by a single developer (Lars Saalbach). It is a tool-first niche, not a social network. — [App Store](https://apps.apple.com/app/beanconqueror/id1445297158); [GitHub](https://github.com/jmtar/Beanconqueror); [Decent Espresso](https://decentespresso.com/blog/beanconqueror_and_the_decent_scale)
- Tasting Grounds is a coffee check-in app positioned like Untappd. No traction data was found. — [App Store](https://apps.apple.com/us/app/tasting-grounds/id1526958511)

**Beli (restaurants)**: the most relevant modern comparable
- Mechanic: instead of stars, users say whether they liked a new place more or less than a similar one already ranked (pairwise comparison), which builds a personal ranked list. Some critics dislike comparing unlike restaurants. — [cavac.at Wikipedia mirror](https://cavac.at/cavacopedia/Beli%20%28app%29); [WSJ via To Vima](https://www.tovima.com/wsj/the-app-that-makes-rating-restaurants-fun-again-and-gets-better-the-more-you-use-it)
- Scale: 75M+ restaurant ratings as of Sept 2025 (InsideHook), and 58M by Q2 2025 per a Substack analysis that says this surpassed Yelp's count. 80% of users are under 35. Food Network calls it "a once niche food app now a social place for Gen Z". — [InsideHook](https://www.insidehook.com/food/does-dining-out-count-beli-app); [Startup Signals Substack](https://startupsignals.substack.com/p/beli-your-food-diary-and-dining-advisor); [Food Network](https://www.foodnetwork.com/fn-dish/news/beli-app-trend)
- Funding conflicts: $12M including FirstMark as of June 2025 (Wikipedia mirror), and $12M total with a Series A on 1 Nov 2023 (Caplight). Tracxn says about $5.3M (Series A, Nov 2023, Goodwater). Dealroom says "no known external funding". No 2026 round was found. — [cavac.at](https://cavac.at/cavacopedia/Beli%20%28app%29); [Caplight](https://www.caplight.com/company/beliapp); [Tracxn](https://tracxn.com/d/companies/beli/__dGog-htkIGO9dxx0slXqdOmKWXD_C9Gm8V6ij9YUamA/funding-and-investors); [Dealroom](https://app.dealroom.co/companies/beli_)
- Named a Forbes Cloud 100 Rising Star 2025. Monetization is analysed in Ivey Business Review's "Beli: A Recipe for Revenue". — [FirstMark](https://firstmark.com/story/beli-named-to-forbes-cloud-100-rising-stars-2025/); [Ivey Business Review](https://www.iveybusinessreview.ca/magazine/articles/beli)

**"Letterboxd for food" crowd**
- Truffle (social restaurant tracker with absolute ratings), Crumble (tenth-of-a-star ratings, lists, friends feed) and Treatly all claim the "Letterboxd for food" label. Most sources are self-published SEO guides. — [Crumble guide](https://crumble.me/guides/letterboxd-for-food); [Savor blog](https://www.savortheapp.com/blog/food-memories-journaling/beli-app-alternatives/); [Medium](https://medium.com/@kaitlyn-ng/letterboxd-beli-and-more-media-tracking-and-its-consequences-365c66578c3b)

### Inferences
- The pattern for success: (1) a large, structured, scannable catalogue (beer and wine SKUs and labels), (2) a fast check-in loop with collection and gamification (badges, lists, rankings), and (3) monetization later through producers and venues (Untappd for Business-style menus and Next Glass's B2B roll-up) or commerce (Vivino). Ice cream pints suit (1) and (3), because they carry barcodes and big CPG brands. Scoop shops suit the venue-SaaS model but lack stable SKUs.
- Category size matters. Spirits (Distiller) and coffee (Beanconqueror) remained niche at tens of thousands of active users. Ice cream is a higher-frequency, more mass-market treat than spirits, but it has less "connoisseur" collecting culture than beer and wine. Beli suggests a casual, Gen Z, social-ranking framing can beat connoisseur framing.
- Beli's pairwise ranking may suit ice cream well: flavours are easy to compare head-to-head, and "my ranked list of every flavour I've had" is shareable content.
- Yelp and Google Maps remain the de facto way to discover scoop shops (shop-level stars, photos). A new app is unlikely to win on shop discovery and should win on flavour-level logging.

### Gaps
- I found no authoritative current Untappd user count or revenue, and no current Vivino revenue.
- Beli's founding year, founders and exact funding are not confirmed. Sources conflict, and the competitor blog's "late 2024 launch" claim looks wrong given 2023 funding records.
- No data on Yelp/Google ice cream search volume. Cheese, donut, pizza and burger rating apps, and snack/candy communities, were not researched due to the tool budget.

## Social communities and evidence of enthusiast demand

### Takeaway
There is clear, growing enthusiast demand: ice cream subreddits grew about 40% year-over-year (third-party estimate), creators have very large audiences, and state ice cream trails draw tens of thousands of passport users. Trails already give "collect them all" check-in behaviour real-world proof.

### Cited Findings
- r/icecream has about 130k members (+39k, +42.9% year-over-year), and r/icecreamery (homemade) about 78k (+22k, +38.2%). r/ninjacreami is reported at 102k–170k (conflicting snapshots). All figures are GummySearch estimates with undated snapshots. — [GummySearch r/icecream](https://gummysearch.com/r/icecream/); [GummySearch r/icecreamery](https://gummysearch.com/r/icecreamery)
- Dylan Lemay (ice cream TikToker) has more than 11.2M followers. He raised $1.5M (2021) to open an NYC ice cream shop. — [Tubefilter](https://www.tubefilter.com/2021/11/16/tiktoker-dylan-lemay-funding-ice-cream-shop/)
- @myinsidescoop (Inside Scoop Ice Cream, Instagram) has about 190K followers (HypeAuditor estimate, 2026). — [HypeAuditor](https://hypeauditor.com/instagram/myinsidescoop/)
- TikTok reviews drive real traffic: a Secaucus, NJ shop had lines down the block after a TikTok review. — [Patch](https://patch.com/new-jersey/secaucus/secaucus-ice-cream-shop-has-lines-down-block-after-tiktok-review)
- Pint reviews of new Ben & Jerry's flavours go viral on TikTok (Daily Dot coverage). — [Daily Dot](https://dailydot.com/ben-and-jerrys-vanilla-target)
- **Maryland's Best Ice Cream Trail** (state Dept. of Agriculture): by 2015 it had distributed 28,000 paper passports, more than 3,000 passports were downloaded online, and nearly 400 families completed the whole trail. — [Maryland Dept. of Agriculture](https://news.maryland.gov/mda/press-release/2015/05/29/marylands-best-ice-cream-trail-opens-for-2015/)
- **Pennsylvania "Scooped" Ice Cream Trail** (Center for Dairy Excellence and Visit PA): 59 creameries in 2026, its largest lineup, with a free digital passport at visitpa.com/scooped. — [MyChesCo](https://www.mychesco.com/a/news/pennsylvania/this-pennsylvania-tradition-is-bigger-than-ice-cream/); [Center for Dairy Excellence](https://www.centerfordairyexcellence.org/?p=18524)

### Inferences
- State trails are a ready-made B2B2C partnership channel. They already run digital passports, which a check-in app could power, and they show that "visit N creameries and earn a reward" motivates real behaviour.
- The creator audience shows that ice cream content performs well socially, but that demand currently lives on TikTok and Instagram rather than in a dedicated logging app. Shareable output (ranked lists, year-in-review) will matter more than the database.
- Fast subreddit growth in homemade ice cream (Ninja Creami) suggests a second user segment, home makers, that a pint/shop app could serve or ignore.

### Gaps
- Pint-review YouTubers and their subscriber counts were not found.
- Pennsylvania's total participant counts, and other states' trails (e.g. Vermont, Wisconsin, Ohio), were not researched.
- Reddit counts come from a third-party tracker, not from Reddit directly.
