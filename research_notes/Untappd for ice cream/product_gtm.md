# Untappd for Ice Cream: Product, Data, Go-to-Market and Business Model Challenges

Research method note: about 19 web searches. Full-page fetches of braze.com and beermenus.com failed because those hosts are outside this session's network allowlist, so several findings come from search-result summaries of those pages rather than the pages themselves. Treat figures marked "(search summary)" as needing a direct check.

## 1. Data cold start: existing catalogs of flavors and shops, and how comparable apps solved it

### Takeaway
No clean, ready-made database of US scoop-shop flavors exists. Packaged pints have partial coverage through UPC/Open Food Facts, and shop locations can be bought from places APIs (Foursquare, Google), but the core asset (what flavor is in which case today) has to be built by crowdsourcing plus photo-to-data extraction, which is what Vivino and Untappd did for their catalogs.

### Cited Findings
- **Shop universe is small and fragmented.** IBISWorld counts 12,781 US ice cream store businesses in 2025, up 2.1% from 12,523 in 2024; industry revenue about $7.4bn in 2025; low market concentration, largest player Cold Stone Creamery — [IBISWorld](https://www.ibisworld.com/united-states/number-of-businesses/ice-cream-stores/4317)
- **Packaged pints: Open Food Facts has coverage but it is thin and uneven.** Its US "ice cream bars" subcategory lists 172 products, nutrition data known for 168. Many US pint pages exist (store brands like Kroger Deluxe, regional dairies like Casper's, Crown Creamery), often with generic names like "ice cream" or "premium ice cream" — [Open Food Facts, ice cream bars](https://us.openfoodfacts.org/category/en:ice-cream-bars); [example product page](https://world.openfoodfacts.org/product/0011110014023/deluxe-ice-cream-the-kroger-co). I could not get a total US ice-cream category count; the live category browser or API with a US filter would give it.
- **Shop locations from places APIs.** Foursquare publishes a category taxonomy for its Places API and Places flat file, with a Google Places migration guide, and has revised category IDs in recent taxonomy updates (so hard-coded IDs can break) — [Foursquare Places Categories](https://docs.foursquare.com/places/docs/categories); [Categories FAQ](https://docs.foursquare.com/places/docs/places-categories-faqs). I did not retrieve the exact ice cream category ID or pricing.
- **POS menu data is possible in principle but weak in practice.** Toast has APIs, but a Toast developer forum thread asks for write access to the Menus API to update prices, implying limits on what partners can do — [Toast developer community](https://developers.toasttab.com/hc/en-us/community/posts/37857032278548-API-to-Update-Menu-Item-Prices). Comparison sites describe Square as the low-cost or no-subscription choice for small ice cream shops, Toast as better for larger parlors with online ordering, and costs running from subscription-free up to about $100/month; flavor and topping inventory tracking is a stated need — [Kitchen Business](https://kitchenbusiness.com/best-ice-cream-shop-pos/); [Merchant Maverick](https://www.merchantmaverick.com/toast-vs-square). Toast POS listed from $69/month — [SourceForge](https://sourceforge.net/software/product/Toast-POS). (These are affiliate-style comparison sites.) Note: many shops ring up "1 scoop / 2 scoops" rather than individual flavors, so POS menus may not contain flavor names at all (inference, not verified).
- **Vivino's cold start.** Founded 2011, it took about two years for the database to be big enough to make a "meaningful" product; the founder photographed bottles in Copenhagen shops while workers in India populated the database; a competition offered a corkscrew for label uploads; unrecognized label scans went to manual matching. Catalog grew from about 500,000 wines (2012) to 1.3 million, and scans went from 80,000/month after the April 2012 launch to 2 million/month — [CNN Money](https://money.cnn.com/2017/08/01/smallbusiness/vivino-wine-app/index.html); [TechCrunch](https://techcrunch.com/?p=717554); [VentureBeat](https://venturebeat.com/business/vivino-uncorks-10-3m-to-turn-anyone-into-a-wine-snob) (search summary).
- **Untappd's cold start.** Built in under 24 hours by Greg Avola and Tim Mather, launched 2010 as a Foursquare-style beer check-in; grew by word of mouth with no marketing budget; grew both reach and database by crowdsourcing product data from users, then gave trusted users moderator rights — [Brewbound](https://www.brewbound.com/news/2016/untappd-merges-with-beer-and-wine-recommendation-app-next-glass); [CNBC](https://www.cnbc.com/2016/04/25/two-guys-created-their-dream-jobs-forged-by-a-love-for-tech-and-beer.html); [Braze](https://www.braze.com/resources/articles/engage-millions-users-mobile-community-building-lessons-untappd) (search summary). Untappd for Business today markets a "3M+ beverage database" — [Toolradar](https://toolradar.com/tools/untappd-for-business/pricing).
- **Menu-photo extraction is production-proven but needs a confidence gate.** DoorDash runs OCR then an LLM to structure menu photos; errors come from OCR scrambling reading order, cropped menus and poor images. Multimodal models handle unusual or multi-column layouts better but are more brittle on dark, glare-heavy or cropped photos. DoorDash added a classifier that predicts whether a transcription meets the accuracy bar and routes failures to humans — [ByteByteGo summary of DoorDash](https://blog.bytebytego.com/p/how-doordash-uses-ai-models-to-understand); [DoorDash engineering](https://careersatdoordash.com/?p=14572). MOTBench (arXiv 2504.13945) benchmarks VLMs on menu OCR and scores per item because whole-menu comparison is unreliable — [arXiv](https://arxiv.org/abs/2504.13945v3). Veryfi claims 99%+ menu OCR accuracy, with no published method — [Veryfi](https://veryfi.com/restaurant-menu-ocr-api).

### Inferences
- The right seed is "places API for shops + Open Food Facts/UPC for pints + user photos of the flavor case or chalkboard run through a vision model, with a confidence threshold and human or community review". Scoop-shop flavor boards (short lists, hand-lettered chalkboards, case labels behind glass with glare) are exactly the hard case DoorDash describes, so expect a meaningful human-review share at first.
- Ice cream has a far smaller "SKU" universe than beer or wine at the brand level (about 12.8k shops vs Untappd's 3M+ beverages), so a founder-led manual seed of one city (a few hundred shops) is feasible in weeks, similar to Vivino's hand photography.
- Shops' own Instagram posts of daily flavors (see Q4) are a scrapeable or shop-forwarded input for the same vision pipeline, subject to platform terms.

### Gaps
- No total count of US ice cream products in Open Food Facts; no commercial UPC database (e.g., Syndigo, NielsenIQ Label Insight) coverage figures found.
- Exact Foursquare/Google Places ice cream category IDs and API pricing not retrieved.
- No evidence found that Square, Toast or Clover menus at scoop shops actually store per-flavor items; needs shop interviews.
- No published accuracy numbers for LLM/vision menu extraction on chalkboards specifically.

## 2. Modelling flavor identity: rotating, seasonal, same-name and shop-specific flavors

### Takeaway
Ice cream needs a two-level model: a canonical "flavor" (owned by a maker, e.g., Jeni's Brambleberry Crisp, or a shop's own recipe) and a dated "availability/instance" at a location; a generic "Cookies & Cream" should be a tag or style, not a shared entity. Untappd's experience shows that without clear merge and variant rules, duplicate cleanup becomes a permanent moderation cost.

### Cited Findings
- Untappd lets breweries merge duplicate beers from a Beer Management tab; staff review merges, the brewer picks the master listing, and merges usually clear in a day or two. Listings on another brewery's page (collabs, guest taps) go through support — [Untappd Help](https://help.untappd.com/hc/en-us/articles/360034035852); [Untappd Help, managing beers](https://help.untappd.com/hc/en-us/articles/360033797752-Breweries-How-do-I-manage-my-beers-on-Untappd)
- Regular users flag duplicates or propose edits for regional moderators — [Untappd Help](https://help.untappd.com/hc/en-us/articles/360033985652)
- Untappd users' "unique beer" counts can drop when merges happen (help article exists on this) — [Untappd Help](https://help.untappd.com/hc/en-us/articles/360034134252-My-unique-beer-count-has-decreased-all-of-a-sudden-What-happened)
- Community reports (not official policy): moderators treat labels that differ only in name or can art as the same liquid; a vintage was merged into its regular edition, which a user said broke the "Vintage Policy"; even senior (M3) moderators cannot reverse merges — [r/Untappd mirror](https://reddit.fsky.io/r/Untappd/comments/1javt91/beers_with_multiple_names); [r/Untappd Apr 2025](https://lr.psf.lt/r/Untappd/comments/1jyv79h/weekly_edit_request_post_20250414); [r/Untappd Jan 2025](https://cal1.lr.ggtyler.dev/r/Untappd/comments/1hpkwi6/weekly_edit_request_post_20241230)
- A RateBeer forum user says Untappd lets brewers specify how vintages are handled when the year is not on the label — [RateBeer community](https://community.ratebeer.com/t/what-makes-untappd-better-than-ratebeer-currently/6232/6) (unverified opinion)
- Real-world rotation examples: Culver's publishes a per-store "Flavor of the Day" calendar; Sweet Cow (Denver-area) has an app listing each shop's current flavor board and notifying users when a favorited flavor is available, but reviews say a location's board did not match the website — [Sweet Cow App Store](https://apps.apple.com/us/app/sweet-cow/id1210614210); [Culver's example](https://configurator.us.yokogawa.com/aanews3/culvers-apple-valley-flavor-of-the-day-scoop-the-sweetness.html) (low-quality page). Salt & Straw runs rotating monthly series and "New Flavor Tuesday" posts — [Particl/Salt & Straw](https://www.particl.com/salt-and-straw/new-flavor-tuesday:-the-cookbook-series-salt-and-straw-is-built-on-surprising-flavor-combos-but-none-of-our-mind-blowing-creative-favorites-would-exist-without-a-deep-understandingand-loveof-the-classics-1434244-34a963cc)

### Inferences
- Suggested model: Maker (brand or shop) -> Flavor (maker-owned recipe, with style tags like "cookies & cream", "mint chip", base type dairy/vegan/gelato/sorbet) -> Format (scoop at shop, pint UPC) -> Sighting/availability (location, date, source: user photo, shop post, POS). Check-ins attach to Flavor + Location + date. This mirrors Untappd's beer/venue split while adding the time dimension Vivino handles with vintages.
- Ratings for generic styles should roll up across makers via tags ("best cookies & cream in Austin") rather than by merging entities, avoiding the merge-reversal problem Untappd has.
- Seasonal returns (pumpkin every October) should reuse the same Flavor entity with a new availability window, like a vintage, unless the maker changes the recipe.
- "Is it in the case right now?" decays fast; sightings need a freshness timestamp and confidence, and the Sweet Cow complaint shows stale boards destroy trust.

### Gaps
- No official Untappd documentation on seasonal/one-off/vintage policy found.
- No found data on how many flavors a typical independent scoop shop rotates per year.

## 3. Engagement: frequency, enthusiasm, and gamification for a low-frequency category

### Takeaway
Ice cream is eaten often at home but scoop-shop visits are seasonal and occasional, so a pure daily-habit loop is unlikely; the strongest existing evidence of engagement is seasonal, place-based passport trails (PA, MD, IN, OH), which run on Bandwango-style digital passports and reward visits with prizes.

### Cited Findings
- US regular ice cream consumption was about 12 lbs per person in 2024 (19 lbs including novelties, sorbet, plant-based), down about 25% from 2000 — [Dairy Processing](https://www.dairyprocessing.com/articles/4390-state-of-the-industry-premium-scoops-innovation-redefining-ice-cream-aisle); [Statista/USDA](https://es.statista.com/statistics/183500/per-capita-consumption-of-ice-cream-in-the-us-since-2000/)
- One market report claims about 74% of Americans eat ice cream at least weekly (2021); original source unverified — [Chowhound / market report via search summary](https://www.chowhound.com/2288093/ice-cream-consumption-america-per-year/)
- Pennsylvania's "Scooped" Ice Cream Trail (2026 season June 4 to September 7) is free, runs on a Bandwango digital passport, partners with PA Preferred and the Center for Dairy Excellence, with 59 creameries in 2026; it was in its eighth year — [VisitPA](https://www.visitpa.com/trip/scooped-ice-cream-trail); [Yahoo News](https://www.yahoo.com/news/pennsylvania-ice-cream-trail-list-200015241.html)
- Maryland's Best Ice Cream Trail 2025: 14 on-farm creameries, May 22 to September 1, moved to a new digital app in 2025; named a "Trailblazer Champion" and state-park-pass prize winner and stops with most check-ins, without publishing counts — [Maryland Dept of Agriculture, May 2025](https://news.maryland.gov/mda/press-release/2025/05/23/marylands-best-kicks-off-the-ice-cream-trail-in-2025-with-new-digital-app/); [MDA results](https://news.maryland.gov/mda/?p=29051)
- Other trails: Kosciusko County, IN digital passport ending Labor Day 2025 — [WNDU](https://www.wndu.com/2025/08/06/kosciusko-county-highlights-businesses-with-ice-cream-trail); Shores & Islands Ohio Sweet Treats Trail (500 points redeem for a scoop) — [Shores & Islands](https://www.shoresandislands.com/articles/post/shores-islands-ohio-debuts-new-sweet-treats-trail/); Cumberland Valley PA free passport — [Visit Cumberland Valley](https://www.visitcumberlandvalley.com/things-to-do/restaurants/cumberland-valley-ice-cream-trail/); Lancaster County 30-spot trail May 23 to Sept 1, 2025 — [PlayEasy](https://blog.playeasy.com/2025/07/15/discover-30-ice-cream-spots-in-lancaster-county/); Bandwango promotes warm-weather passes as a product category — [Bandwango](https://bandwango.com/resources/5-warm-weather-passes-to-inspire-you-2)
- Untappd badges: sponsored badges have fixed timelines and unlock criteria; an Untappd staffer claimed businesses with sponsored badges typically see a 50 to 100% increase in check-ins (vendor claim) — [Untappd Lounge, badges](https://lounge.untappd.com/everything-you-need-to-know-about-untappd-badges)
- Beli's gamification: pairwise "did you like it more or less than X" ranking builds a personal list; college leaderboards and a "Dining Hall of Fame" competition among 187 universities — [Wikipedia: Beli](https://en.wikipedia.org/wiki/Beli_(app)); [Ivey Business Review](https://www.iveybusinessreview.ca/magazine/articles/beli)

### Inferences
- Ice cream is harder than beer on frequency (scoop visits cluster in summer, and a cone per week is a high-intensity user) but easier on breadth of appeal (families, kids, non-drinkers, no age gate, no alcohol ad restrictions, highly photogenic).
- Gamification should be collection- and season-based rather than streak-based: city/state "passports", seasonal badges ("Summer 2027: 10 shops"), "flavor bingo" by style, "first to log a new flavor" credit (which also feeds the catalog). Daily streaks would punish the normal usage pattern.
- Beli-style pairwise ranking fits ice cream well: users may only log a handful of scoops per month, and ranking gives value from few entries.
- The trail programs are a ready-made partnership channel: tourism boards and dairy councils already pay for passport software and already recruit creameries.

### Gaps
- No published participation, check-in or redemption totals for any ice cream trail found; would need to ask Visit PA, MDA or Bandwango directly.
- No reliable US data on scoop-shop visit frequency (vs at-home consumption) found.
- Bandwango pricing to destinations not found.

## 4. Business models and what scoop shops pay for and struggle with

### Takeaway
Untappd's playbook transfers: shop-side SaaS for digital menus (Untappd for Business about $899 to $1,199/year), sponsored badges and in-app promos for brands, and geo-targeted promotion. But ice cream shops are smaller and more seasonal than bars, so per-shop SaaS likely needs a lower price point or a free tier, with brand sponsorship (CPG pints) and tourism-board trail contracts as the more promising early revenue.

### Cited Findings
- **Untappd for Business pricing:** two tiers since spring 2023; Essentials about $899/year or $89.99/month; Premium about $1,199/year or $119.99/month. Essentials includes the 3M+ beverage database, menu publishing, digital displays, QR menus, up to 20 non-beer items and 5 users; Premium adds unlimited users and non-beer items, Wine-Searcher data, custom CSS, API, premium onboarding. Official pricing page requires a form; 7-day free trial — [Toolradar](https://toolradar.com/tools/untappd-for-business/pricing); [Fitgap](https://us.fitgap.com/products/untappd-for-business); [Untappd Help](https://help.untappd.com/hc/en-us/articles/360033958612-How-Can-I-Sign-Up-for-Untappd-for-Business); [UTFB pricing page](https://utfb.untappd.com/get-pricing/); [BeerMenus on 2023 price increase](https://www.beermenus.com/blog/312-untappd-for-business-price-increase). Competitors pitch cheaper alternatives (Taplist.io, BeerMenus, Raspberry Pints, which claims a free tier for up to 3 taps, unverified) — [Taplist.io](https://homepage2.taplist.io/compare/untappd-for-business-alternative); [Raspberry Pints](https://www.raspberrypints.com/compare/untappd-for-business)
- **Untappd brand advertising (Next Glass):** in-app promotions, sponsored badges, geotargeted campaigns; reported prices of $2,000/month for a nationwide sponsored badge, $10,000/month for in-app promotions, $30,000/month for home-screen placement (date uncertain, may be outdated); Next Glass claims 12M+ users and 43M+ monthly in-app impressions — [Brewbound](https://www.brewbound.com/news/untappds-parent-company-acquires-beer-advocate); [Next Glass Untappd Marketing](https://www.nextglass.co/untappd-marketing); [Next Glass sponsorships](https://sponsorships.nextglass.co/). A low-quality FAQ site cites a former employee saying Untappd never passed 2M MAU globally, which conflicts with company claims — [Blumble](https://www.blumble.com/r/untappd.com/faq)
- **Untappd's early revenue** came from geo-targeted promotions such as beer festival ads and badges — [CNBC](https://www.cnbc.com/2016/04/25/two-guys-created-their-dream-jobs-forged-by-a-love-for-tech-and-beer.html) (search summary)
- **Beli monetization/funding:** reportedly $5.3M Series A (Nov 2023, aggregator source); founders decline to share DAU — [The Company Check](https://www.thecompanycheck.com/company/b/beli/glfy2ur8fjyyrrwjx); [Ivey Business Review "Beli: A Recipe for Revenue"](https://www.iveybusinessreview.ca/magazine/articles/beli)
- **Shop software spend:** small shops lean to Square (no subscription) and larger parlors to Toast ($69+/month) or Lavu (about $99/month/terminal); total POS spend runs from subscription-free to about $100/month — [Kitchen Business](https://kitchenbusiness.com/best-ice-cream-shop-pos/); [Lavu](https://lavu.com/toast-alternatives-for-ice-cream/)
- **Pain point: communicating daily flavors.** Supplier Perry's Ice Cream advises shops to post available flavors so customers can decide before arriving; froyo trade guidance says post flavors as often as they change, falling back to Facebook/Twitter if no app — [Perry's Ice Cream](https://www.perrysicecream.com/blog/tips-for-a-successful-scoop-shop-season/); [International Frozen Yogurt Association](https://internationalfrozenyogurt.com/social-media-froyo-shops/). Chains build their own: Sweet Cow's app shows current boards and flavor alerts; Culver's Flavor of the Day calendar; Bruster's and Cold Stone have apps — [Sweet Cow](https://apps.apple.com/us/app/sweet-cow/id1210614210); [Bruster's](https://apps.apple.com/us/app/brusters/id1132180307)
- **Existing consumer competitors:** Dippd (rate flavors, top shops, personal flavor collection; too few App Store ratings to show a score); ScoopQuest (AI flavor/parlor discovery); Foothills Creamery check-in loyalty — [Dippd App Store](https://apps.apple.com/us/app/dippd/id6451426152); [AppGoblin ScoopQuest](https://appgoblin.info/apps/6761337214); [Foothills Creamery](https://marlvel.ai/apps/foothills-creamery)

### Inferences
- **Shop SaaS:** the "what's in the case today" problem is real (shops already hand-post to Instagram), so the wedge product is "snap the case, publish everywhere": one photo becomes a structured board on the app, a website embed, a TV menu, and an Instagram-ready image. Given the seasonal, sub-$100/month POS budgets, price well below Untappd for Business (perhaps free basic tier, paid $15 to $40/month for TV boards, embeds, flavor alerts to followers). This is an inference; price sensitivity is untested.
- **Brand partnerships:** national pint brands (Ben & Jerry's, Jeni's, Salt & Straw, Van Leeuwen, Tillamook) launch limited flavors constantly and fit Untappd's sponsored-badge format; this likely monetizes earlier than shop SaaS because one contract equals many shops. Pint check-ins via UPC scan let grocery-pint brands participate without scoop shops.
- **Tourism/dairy-board trails:** sell or co-run digital passports (a market Bandwango already serves), which brings users and creameries together in one contract.
- **Data/insights:** "flavor trend" reports to CPG brands are plausible only after scale; weak early.
- **Consumer subscription:** Untappd Insiders-style premium (stats, year-in-review) is a small add-on, not a primary model, for a low-frequency category.
- **Affiliate/delivery:** pint delivery (DoorDash/Instacart links) or Goldbelly-style shipping of regional pints is possible but low-margin; not researched in depth.

### Gaps
- No interviews or surveys of scoop-shop owners on digital-menu willingness to pay found.
- No current Untappd/Next Glass ad rate card with a date; prices above may be stale.
- No data on CPG ice cream brands buying social-app sponsorships found.

## 5. Go-to-market: city launches, creators, festivals and trails, campuses; Beli and Untappd lessons

### Takeaway
Both analogues grew overwhelmingly by word of mouth (Beli about 80% of growth, Untappd with no marketing budget), with Beli using invite gating and campus leaderboards; for ice cream, a single summer city launch tied to a trail or festival, seeded catalog, and TikTok food creators (who demonstrably move scoop-shop traffic) is the most evidence-backed path.

### Cited Findings
- Beli: founded 2021, strongest among Gen Z in NYC; invite-only before public launch; co-founder says about 80% of growth is word of mouth, Ivey says over 80% of users join via referral; 75M to 80M+ ratings; onboarding reportedly asked prospects to invite four people before signing up; college leaderboards and a 187-university Dining Hall of Fame contest — [Wikipedia: Beli](https://en.wikipedia.org/wiki/Beli_(app)); [WSJ via To Vima](https://www.tovima.com/wsj/the-app-that-makes-rating-restaurants-fun-again-and-gets-better-the-more-you-use-it); [Ivey Business Review](https://www.iveybusinessreview.ca/magazine/articles/beli); [Demand Curve Growth Newsletter #285](https://www.demandcurve.com/newsletters/growth-newsletter-285); [Abridged (Sacramento)](https://www.abridged.org/?p=3105); [Food Network](https://www.foodnetwork.com/fn-dish/news/beli-app-trend); [Boston Globe, Aug 2026](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/)
- Untappd: word-of-mouth growth, founders kept day jobs, early ties to beer festivals via geo-targeted promos; hit 1M check-ins early and acquired RedPint; 500M check-ins by 2017 — [TechCrunch](https://techcrunch.com/?p=311066); [Untappd blog](https://blog.untappd.com/post/165869743736/cheers-to-500000000-check-ins); [CNBC](https://www.cnbc.com/2016/04/25/two-guys-created-their-dream-jobs-forged-by-a-love-for-tech-and-beer.html)
- TikTok creators move ice cream traffic: NJ reviewer Kingschratz's review of Mike's Ice Cream (Secaucus) got 200k likes day one, 2M views and 400k likes within days; lines down the block and tubs sold out within about a day — [Patch](https://patch.com/new-jersey/secaucus/secaucus-ice-cream-shop-has-lines-down-block-after-tiktok-review). The flip side: a viral video accusing "handmade" shops of using Sysco base shows creators can also damage trust — [BroBible](https://brobible.com/culture/article/sysco-homemade-ice-cream-scam)
- Trails are an existing seasonal channel with government partners (PA 59 creameries, MD 14, county trails in IN, OH, PA) — see Q3 sources.

### Inferences
- Launch one dense metro in late spring (May), not fall; target the June to August peak. Pre-seed every shop in the metro and ideally the day's flavors for the top 50 shops before launch, so first-session value exists (Vivino's two-year empty-catalog problem is the warning).
- Partner with an existing trail (e.g., Pennsylvania's Scooped or a county trail) as the "passport" layer, or run a city "Scoop Passport" with a sponsor; this gives creameries a reason to put up QR codes.
- Use creators as a paid or co-promoted channel per city ("rank every cookies & cream in Philly"); Beli-style ranking content is natively shareable.
- College towns are good for density and word of mouth but empty in summer (peak ice cream season), so campus pushes fit better in late spring and early fall; this tension is an inference worth testing.
- Invite gating worked for Beli because restaurant ranking is a social status signal; ice cream may be more family/casual, so friction could hurt more than help (inference).

### Gaps
- No found postmortems of failed ice cream or dessert check-in apps (Dippd and others appear small; status unknown).
- No reliable follower counts for specific US ice cream reviewers.
- No Andrew Chen / Lenny's Newsletter cold-start pages fetched; the atomic-network concept from "The Cold Start Problem" is from general knowledge, not cited here.

## 6. Technical: PWA vs native, and minimal MVP scope

### Takeaway
A PWA can cover photo capture, geolocation and (installed-to-home-screen only) push on iOS 16.4+, so a PWA MVP is viable, but iOS push needs home-screen install and has low acceptance, there is no background sync or geofencing, and EU push is restricted; native wins later for "you are near a shop with your favorite flavor" alerts.

### Cited Findings
- iOS web push for installed web apps since iOS 16.4 (March 2023), with Declarative Web Push in iOS 18.4; push requires home-screen install; EU PWAs lost push in iOS 17.4; 2025 HTTP Archive Web Almanac puts mobile push permission acceptance around 16% — [MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide); [Codewave](https://codewave.com/insights/progressive-web-apps-ios-limitations-status/)
- Geolocation and photo upload work in PWAs; advanced camera controls do not; an older post says live camera streaming was unsupported on iOS PWAs (likely outdated); no background sync on iOS PWAs; Safari is the only full PWA install path on iOS — [Metana](https://metana.io/blog/is-the-progressive-web-app-pwa-still-relevant/); [DEV Community](https://dev.to/niscontractor/challenges-with-ios-pwa-13ho); [Tigren](https://www.tigren.com/?p=80784); [Framesixty](https://framesixty.com/pwa-vs-native-app/). (All vendor blogs, not Apple docs.)

### Inferences
- Check-in with photo (file input with capture), current location, and rating works in a PWA. Shop-side "snap the case" also works as a web flow, which suits shop staff who will not install an app.
- Native is needed for: background geofence alerts ("Pumpkin is back at the shop 0.3 mi away"), reliable push without install, and App Store discovery. A common path is PWA for MVP and shop tools, then a thin native wrapper (Capacitor or similar) once retention is proven.
- Minimal MVP: (1) shop directory for one metro seeded from a places API; (2) flavor entities with maker, style tags and dated sightings; (3) check-in = photo + flavor + shop + 1 to 5 rating or pairwise rank; (4) "what's in the case today" pages fed by user/shop photos through vision extraction with a review queue; (5) one seasonal passport with badges; (6) follow a shop or flavor for alerts. Defer social feed depth, pints via UPC, brand dashboards and data products.

### Gaps
- No Apple primary documentation retrieved on current (iOS 26) PWA capabilities; verify on device.
- No data on PWA vs native retention for check-in apps specifically.
