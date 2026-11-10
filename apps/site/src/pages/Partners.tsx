import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { ContourLines, Reveal, WaypointPin } from '@/components/Decor';
import PartnerInquiryForm from '@/components/PartnerInquiryForm';
import { usePageHead } from '@/lib/head';
import { images, partner } from '@/content';

const kicker = 'font-mono text-sm uppercase tracking-[0.25em] text-primary';
const h2 = 'mt-base font-heading text-4xl leading-tight text-foreground sm:text-5xl';

export default function PartnerPage() {
  usePageHead(
    "Partner with Echo Finders · Bring your place's stories to life",
    'https://echofinders.com/partners',
    'Echo Finders partners with municipalities, tourism organizations, museums, historians, and local businesses to build location-based audio destination collections.',
  );
  return (
    <main>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-[70vh] items-end overflow-hidden py-xxxl pt-48">
        <img
          src={images.partnerHero}
          alt="People walking down a historic downtown street"
          width={1920}
          height={800}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--background))] via-black/50 to-black/60" />
        <ContourLines className="pointer-events-none absolute inset-0 h-full w-full text-white/10" />
        <div className="pointer-events-none absolute right-[10%] top-[30%] hidden lg:block">
          <WaypointPin />
          <p className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-white/80">{partner.hero.coordinates}</p>
        </div>

        <div className="relative mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className={kicker}>{partner.hero.kicker}</p>
            <h1 className="mt-lg font-heading text-4xl leading-[1.05] text-foreground sm:text-6xl lg:text-7xl">
              <span className="block">{partner.hero.titleLine1}</span>
              <span className="block italic text-primary">{partner.hero.accent}</span>
            </h1>
            <p className="mt-lg max-w-xl leading-relaxed text-white/85">{partner.hero.subtitle}</p>
            <div className="mt-xl flex flex-wrap items-center gap-base">
              <Button asChild size="lg" className="rounded-full px-8">
                <Link to="/partners#inquiry">{partner.hero.cta}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who we partner with ──────────────────────────────── */}
      <section className="py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-lg max-w-2xl">
            <p className={kicker}>{partner.who.kicker}</p>
            <h2 className={h2}>{partner.who.title}</h2>
            <p className="mt-lg leading-relaxed text-muted-foreground">{partner.who.intro}</p>
          </Reveal>

          <div className="grid grid-cols-1 gap-base sm:grid-cols-2 lg:grid-cols-5">
            {partner.who.audiences.map((aud, i) => (
              <Reveal key={aud.id} delay={i * 0.06}>
                <div className="h-full rounded-xl border border-border bg-card p-base">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(var(--primary)/0.5)]"
                    aria-hidden="true"
                  />
                  <h3 className="mt-base font-heading text-xl text-foreground">{aud.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{aud.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ways to partner ──────────────────────────────────── */}
      <section className="border-y border-border bg-card/40 py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-lg max-w-2xl">
            <p className={kicker}>{partner.offerings.kicker}</p>
            <h2 className={h2}>{partner.offerings.title}</h2>
            <p className="mt-lg leading-relaxed text-muted-foreground">{partner.offerings.intro}</p>
          </Reveal>

          <div className="grid grid-cols-1 gap-base sm:grid-cols-2">
            {partner.offerings.items.map((offer, i) => (
              <Reveal key={offer.id} delay={(i % 2) * 0.08}>
                <div className="relative h-full overflow-hidden rounded-xl border border-border bg-background p-xl">
                  <span className="font-mono text-sm tracking-[0.2em] text-primary">{offer.detail}</span>
                  <h3 className="mt-base font-heading text-2xl text-foreground">{offer.title}</h3>
                  <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">{offer.body}</p>
                  <ContourLines className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-border opacity-40" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process ──────────────────────────────────────────── */}
      <section className="py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-lg max-w-2xl">
            <h2 className="font-heading text-4xl leading-tight text-foreground sm:text-5xl">{partner.process.title}</h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-base md:grid-cols-3">
            {partner.process.steps.map((step, i) => (
              <Reveal key={step.id} delay={i * 0.08}>
                <div className="relative h-full rounded-xl border border-border bg-card p-base">
                  <span className="font-mono text-sm tracking-[0.2em] text-primary">{step.index}</span>
                  <h3 className="mt-base font-heading text-2xl text-foreground">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sponsorship / integrity ──────────────────────────── */}
      <section className="relative overflow-hidden py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-xl lg:grid-cols-12">
            <Reveal className="lg:col-span-6">
              <p className={kicker}>{partner.sponsorship.kicker}</p>
              <h2 className={h2}>{partner.sponsorship.title}</h2>
              {partner.sponsorship.body.map((para) => (
                <p key={para} className="mt-base max-w-xl leading-relaxed text-muted-foreground">
                  {para}
                </p>
              ))}
            </Reveal>
            <Reveal delay={0.1} className="lg:col-span-6">
              <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-primary/10 p-xl">
                <WaypointPin className="mx-auto h-16 w-16" />
                <p className="mt-lg text-center font-heading text-2xl leading-snug text-foreground sm:text-3xl">
                  {partner.sponsorship.promise}
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Inquiry form ─────────────────────────────────────── */}
      <section id="inquiry" className="scroll-mt-24 border-t border-border bg-card/40 py-xxxl">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8">
          <div className="grid gap-xl lg:grid-cols-12">
            <Reveal className="lg:col-span-4">
              <p className={kicker}>{partner.form.kicker}</p>
              <h2 className={h2}>{partner.form.title}</h2>
              <p className="mt-lg leading-relaxed text-muted-foreground">{partner.form.intro}</p>
              <p className="mt-lg text-sm leading-relaxed text-muted-foreground">{partner.form.note}</p>
            </Reveal>
            <Reveal delay={0.1} className="lg:col-span-8">
              <div className="rounded-xl border border-border bg-background p-base sm:p-xl">
                <PartnerInquiryForm />
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </main>
  );
}
