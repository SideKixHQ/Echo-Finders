import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ContourLines, Reveal, WaypointPin, WaveformBars } from '@/components/Decor';
import { usePageHead } from '@/lib/head';
import { APP_URL, CONTACT_EMAIL, home, images } from '@/content';

// The nine Echo categories in three rows of three, the first row taller. On a two-column
// phone or tablet the first card runs full width so the rest pair up evenly.
const categorySpans = [
  'sm:col-span-2 lg:col-span-2 h-72 sm:h-80',
  'sm:col-span-1 lg:col-span-2 h-72 sm:h-80',
  'sm:col-span-1 lg:col-span-2 h-72 sm:h-80',
  ...Array.from({ length: 6 }, () => 'sm:col-span-1 lg:col-span-2 h-64 sm:h-72'),
];

const pinPositions = [
  { left: '10%', top: '56%' },
  { left: '44%', top: '24%' },
  { left: '68%', top: '62%' },
];

const outlineOnDark = 'rounded-full border-white/30 bg-black/40 px-8 text-white hover:bg-black/60 hover:text-white';

export default function HomePage() {
  usePageHead('Echo Finders — Stand where it happened. Hear the Echo.', 'https://echofinders.com/');
  return (
    <main>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex h-svh min-h-[640px] items-end overflow-hidden">
        <motion.img
          src={images.homeHero}
          alt="A historic street glowing at dusk"
          width={1920}
          height={1080}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ scale: 1.02 }}
          animate={{ scale: 1.1 }}
          transition={{ duration: 24, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--background))] via-black/30 to-black/50" />
        <ContourLines className="pointer-events-none absolute inset-0 h-full w-full text-white/10" />

        <motion.div
          className="absolute right-[8%] top-[34%] hidden md:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
        >
          <WaypointPin />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">{home.hero.coordinates}</p>
        </motion.div>

        <div className="relative mx-auto w-full max-w-content px-4 pb-xxxl pt-40 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.hero.kicker}</p>
            <h1 className="mt-lg font-heading text-5xl leading-[1.04] text-foreground sm:text-6xl lg:text-7xl xl:text-8xl">
              <span className="block">{home.hero.titleLine1}</span>
              <span className="block italic text-primary">{home.hero.titleAccent}</span>
            </h1>
            <p className="mt-lg max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{home.hero.subtitle}</p>
            <div className="mt-xl flex flex-wrap items-center gap-base">
              <Button asChild size="lg" className="rounded-full px-8">
                <a href={APP_URL}>{home.hero.primaryCta}</a>
              </Button>
              <Button asChild size="lg" variant="outline" className={outlineOnDark}>
                <Link to="/partners">{home.hero.secondaryCta}</Link>
              </Button>
            </div>
          </motion.div>

          <motion.p
            className="mt-xxl font-mono text-[10px] uppercase tracking-[0.25em] text-white/60"
            animate={{ opacity: [0.35, 0.9, 0.35] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            {home.hero.scrollHint}
          </motion.p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how-it-works" className="relative scroll-mt-24 py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="grid gap-xl lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Reveal>
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.how.kicker}</p>
                <h2 className="mt-base font-heading text-4xl leading-tight text-foreground sm:text-5xl">{home.how.title}</h2>
                <p className="mt-lg max-w-md leading-relaxed text-muted-foreground">{home.how.intro}</p>
              </Reveal>
              <Reveal delay={0.15} className="mt-xl">
                <figure className="relative overflow-hidden rounded-xl border border-border">
                  <img
                    src={images.howItWorks}
                    alt="A person walking alone down a dark street at night"
                    width={800}
                    height={1000}
                    loading="lazy"
                    className="h-80 w-full object-cover lg:h-[420px]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <WaypointPin className="h-14 w-14" />
                  </div>
                  <figcaption className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
                    {home.capeFear.coordinates}
                  </figcaption>
                </figure>
              </Reveal>
            </div>

            <div className="lg:col-span-7 lg:pl-xl">
              <div className="relative">
                <div className="absolute bottom-2 left-[7px] top-2 border-l border-dashed border-border" aria-hidden="true" />
                {home.how.steps.map((step, i) => (
                  <Reveal
                    key={step.id}
                    delay={i * 0.1}
                    className={'relative pb-xl pl-10 last:pb-0 ' + (i % 2 === 1 ? 'lg:ml-xl' : '')}
                  >
                    <span
                      className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-primary bg-background shadow-[0_0_10px_2px_hsl(var(--primary)/0.4)]"
                      aria-hidden="true"
                    />
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-xs text-primary">{step.index}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{step.timestamp}</span>
                    </div>
                    <h3 className="mt-2 font-heading text-2xl text-foreground sm:text-3xl">{step.title}</h3>
                    <p className="mt-3 max-w-lg leading-relaxed text-muted-foreground">{step.body}</p>
                    {i === 2 && <WaveformBars className="mt-4 h-5" />}
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Echo categories (bento) ──────────────────────────── */}
      <section id="echoes" className="relative scroll-mt-24 py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-lg max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.echoes.kicker}</p>
            <h2 className="mt-base font-heading text-4xl leading-tight text-foreground sm:text-5xl">{home.echoes.title}</h2>
            <p className="mt-lg leading-relaxed text-muted-foreground">{home.echoes.intro}</p>
          </Reveal>

          <div className="grid grid-cols-1 gap-base sm:grid-cols-2 lg:grid-cols-6">
            {home.echoes.categories.map((cat, i) => (
              <Reveal key={cat.id} delay={(i % 3) * 0.08} className={categorySpans[i] ?? ''}>
                <article className="group relative h-full overflow-hidden rounded-xl border border-border">
                  <img
                    src={cat.image}
                    alt={cat.imageAlt}
                    width={900}
                    height={700}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-200 ease-out group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                  <div className="pointer-events-none absolute right-4 top-4 opacity-70 transition-opacity duration-200 group-hover:opacity-100">
                    <WaypointPin className="h-10 w-10" />
                  </div>
                  <div className="relative flex h-full flex-col justify-end p-base">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{cat.tag}</p>
                    <h3 className="mt-2 font-heading text-2xl text-white sm:text-3xl">{cat.name}</h3>
                    <p className="mt-1 text-sm text-white/80">{cat.tease}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── The app experience ───────────────────────────────── */}
      <section id="experience" className="relative scroll-mt-24 overflow-hidden py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-xl lg:grid-cols-12">
            <div className="lg:col-span-6">
              <Reveal>
                <div className="relative h-[420px] overflow-hidden rounded-xl border border-border bg-card lg:h-[540px]">
                  <div
                    className="absolute inset-0"
                    aria-hidden="true"
                    style={{
                      backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />
                  <svg
                    className="absolute inset-0 h-full w-full text-primary/60"
                    viewBox="0 0 400 500"
                    fill="none"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M-20 420 C 80 380, 140 300, 210 300 S 340 250, 430 180" stroke="currentColor" strokeWidth="2" strokeDasharray="1 8" />
                    <path d="M60 -20 C 90 80, 40 160, 120 220 S 200 340, 160 520" className="text-border" stroke="currentColor" strokeWidth="1" />
                  </svg>

                  {home.mapMock.pinLabels.map((pin, i) => (
                    <div key={pin.id} className="absolute" style={pinPositions[i]}>
                      <WaypointPin className="h-10 w-10" />
                      <p className="mt-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/80">
                        {pin.label}
                      </p>
                    </div>
                  ))}

                  <div className="absolute bottom-6 left-6 right-6 flex items-center gap-4 rounded-lg border border-border bg-background/90 px-4 py-3 backdrop-blur sm:right-auto">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Play size={16} className="ml-0.5" fill="currentColor" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{home.mapMock.nowPlaying}</p>
                      <p className="truncate text-sm font-medium text-foreground">{home.mapMock.nowPlayingTitle}</p>
                    </div>
                    <WaveformBars className="ml-2" />
                    <span className="font-mono text-xs text-muted-foreground">{home.mapMock.nowPlayingTime}</span>
                  </div>
                </div>
                <p className="mt-base text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {home.mapMock.title}
                </p>
              </Reveal>
            </div>

            <div className="lg:col-span-6 lg:pl-xl">
              <Reveal>
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.app.kicker}</p>
                <h2 className="mt-base font-heading text-4xl leading-tight text-foreground sm:text-5xl">{home.app.title}</h2>
              </Reveal>
              <div className="mt-lg">
                {home.app.features.map((feature, i) => (
                  <Reveal key={feature.id} delay={i * 0.08}>
                    <div className={'border-b border-border py-lg ' + (i === 0 ? 'pt-0' : '')}>
                      <div className="flex items-center justify-between gap-base">
                        <h3 className="font-heading text-2xl text-foreground">{feature.title}</h3>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{feature.detail}</span>
                      </div>
                      <p className="mt-2 max-w-md leading-relaxed text-muted-foreground">{feature.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="relative scroll-mt-24 py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-lg max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.pricing.kicker}</p>
            <h2 className="mt-base font-heading text-4xl leading-tight text-foreground sm:text-5xl">{home.pricing.title}</h2>
            <p className="mt-lg leading-relaxed text-muted-foreground">{home.pricing.intro}</p>
          </Reveal>
          <div className="grid gap-base md:grid-cols-3">
            {home.pricing.plans.map((plan, i) => (
              <Reveal key={plan.id} delay={i * 0.08}>
                <article
                  className={
                    'flex h-full flex-col rounded-xl border p-lg ' +
                    ('featured' in plan && plan.featured ? 'border-primary/60 bg-primary/10' : 'border-border bg-card')
                  }
                >
                  <h3 className="font-heading text-2xl text-foreground">{plan.name}</h3>
                  <p className="mt-base">
                    <span className="font-heading text-4xl text-foreground">{plan.price}</span>{' '}
                    <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">{plan.per}</span>
                  </p>
                  <p className="mt-base leading-relaxed text-muted-foreground">{plan.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-lg flex flex-col gap-base md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              <p>{home.pricing.region}</p>
              <p className="mt-2">
                {home.pricing.note} Questions?{' '}
                <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0 rounded-full px-8">
              <a href={APP_URL}>{home.pricing.cta}</a>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── Partners ─────────────────────────────────────────── */}
      <section id="partners" className="relative scroll-mt-24 py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="grid overflow-hidden rounded-xl border border-border lg:grid-cols-12">
            <div className="relative min-h-[320px] lg:col-span-7">
              <img
                src={images.partners}
                alt="A wooden boardwalk lit by warm lights at dusk"
                width={1400}
                height={1000}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 to-black/10" />
              <div className="pointer-events-none absolute bottom-6 left-6">
                <WaypointPin className="h-12 w-12" />
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">{home.capeFear.coordinates}</p>
              </div>
            </div>

            <div className="bg-card/95 p-xl backdrop-blur lg:col-span-5">
              <Reveal>
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.partners.kicker}</p>
                <h2 className="mt-base font-heading text-3xl leading-tight text-foreground sm:text-4xl">{home.partners.title}</h2>
                {home.partners.body.map((para) => (
                  <p key={para} className="mt-base leading-relaxed text-muted-foreground">
                    {para}
                  </p>
                ))}
                <p className="mt-lg font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/80">{home.partners.audiences}</p>
              </Reveal>

              {home.partners.offers.map((offer, i) => (
                <Reveal key={offer.id} delay={i * 0.06}>
                  <div className={'flex gap-4 py-base ' + (i < home.partners.offers.length - 1 ? 'border-b border-border' : '')}>
                    <span
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.5)]"
                      aria-hidden="true"
                    />
                    <div>
                      <h3 className="font-heading text-lg text-foreground">{offer.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{offer.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}

              <Reveal>
                <p className="mt-lg rounded-lg border border-primary/30 bg-primary/10 px-base py-4 text-sm leading-relaxed text-foreground">
                  {home.partners.integrity}
                </p>
                <Button asChild size="lg" variant="outline" className="mt-xl rounded-full px-8">
                  <Link to="/partners">{home.partners.cta}</Link>
                </Button>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── Cape Fear region ─────────────────────────────────── */}
      <section id="cape-fear" className="relative scroll-mt-24 overflow-hidden">
        <img
          src={images.capeFear}
          alt="A wooden walkway over the water in coastal North Carolina"
          width={1920}
          height={800}
          loading="lazy"
          className="h-[70vh] min-h-[480px] w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--background))] via-black/45 to-black/40" />
        <div className="pointer-events-none absolute right-[10%] top-[24%] hidden lg:block">
          <WaypointPin />
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
            <Reveal className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{home.capeFear.kicker}</p>
              <h2 className="mt-base font-heading text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">{home.capeFear.title}</h2>
              {home.capeFear.body.map((para) => (
                <p key={para} className="mt-base max-w-xl leading-relaxed text-white/85">
                  {para}
                </p>
              ))}
              <p className="mt-xl font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{home.capeFear.mapping}</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section id="get-the-app" className="relative scroll-mt-24 overflow-hidden py-xxxl">
        <img
          src={images.closing}
          alt="A wooden dock under a starry night sky"
          width={1920}
          height={1080}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[hsl(var(--background))] via-black/70 to-[hsl(var(--background))]" />
        <ContourLines className="pointer-events-none absolute inset-0 h-full w-full text-white/5" />
        <div className="pointer-events-none absolute right-[8%] top-[18%] hidden opacity-70 lg:block">
          <WaypointPin className="h-24 w-24" dotClassName="h-4 w-4" />
        </div>

        <div className="relative mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="grid gap-xl lg:grid-cols-12 lg:items-end">
            <Reveal className="lg:col-span-8">
              <h2 className="font-heading text-5xl leading-[1.05] text-foreground sm:text-6xl lg:text-7xl">
                <span className="block">{home.closing.title}</span>
                <span className="block italic text-primary">{home.closing.accent}</span>
              </h2>
            </Reveal>
            <Reveal delay={0.15} className="lg:col-span-4">
              <p className="max-w-sm leading-relaxed text-white/85">{home.closing.body}</p>
              <div className="mt-xl flex flex-wrap gap-base">
                <Button asChild size="lg" className="rounded-full px-8">
                  <a href={APP_URL}>{home.closing.appCta}</a>
                </Button>
                <Button asChild size="lg" variant="outline" className={outlineOnDark}>
                  <Link to="/partners">{home.closing.partnerCta}</Link>
                </Button>
              </div>
              <p className="mt-xl font-mono text-[10px] uppercase tracking-[0.25em] text-white/60">{home.closing.coordinates}</p>
            </Reveal>
          </div>
        </div>
      </section>
    </main>
  );
}
