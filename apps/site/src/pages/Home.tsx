import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EchoCharacter, type EchoFace } from '@echofinders/echo';

import { Button } from '@/components/ui/button';
import { ContourLines, Reveal } from '@/components/Decor';
import { APP_URL, CONTACT_EMAIL, follow, home } from '@/content';
import { usePageHead } from '@/lib/head';

/**
 * Follow the echo (James, 2026-11-08).
 *
 * The home page is a small version of the app: an echo paused at a place, that notices
 * you as you come near, that you sync with, and that then plays, here, for real. The
 * character is the app's own (`@echofinders/echo`), so the site and the app can never
 * drift into two different creatures.
 */
export default function HomePage() {
  usePageHead("Echo Finders · Something happened right here. It's still echoing.", 'https://echofinders.com/');
  return (
    <main>
      <Hero />
      <Notices />
      <Sync />
      <Where />
      <Kinds />
      <Pricing />
      <Go />
    </main>
  );
}

/** The character on its own, in an SVG of its own. Pure presentation. */
function Echo({ face, size, gaze = 0, uid }: { face: EchoFace; size: number; gaze?: number; uid: string }) {
  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size} aria-hidden="true" className="overflow-visible">
      <EchoCharacter face={face} r={47} uid={uid} gazeDeg={gaze} detail />
    </svg>
  );
}

/** True once the element has been on screen, for faces that should change as you arrive. */
function useSeen<T extends Element>(threshold = 0.5) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative scroll-mt-24 px-4 py-xxl sm:px-6 lg:px-8 ${className}`}>
      <div className="mx-auto w-full max-w-content">{children}</div>
    </section>
  );
}

const kicker = 'font-mono text-xs uppercase tracking-[0.25em] text-primary';
const h2 = 'mt-base font-heading text-4xl leading-tight text-foreground sm:text-5xl';

/* ── 1. Paused, at a place ─────────────────────────────────────────────────── */

function Hero() {
  // Sealed and turned away, the way every echo waits in the app. It breathes.
  return (
    <section className="relative flex min-h-svh items-center overflow-hidden px-4 pt-28 sm:px-6 lg:px-8">
      <ContourLines className="pointer-events-none absolute inset-0 h-full w-full text-white/10" />
      <div className="relative mx-auto grid w-full max-w-content items-center gap-xl lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <h1 className="font-heading text-5xl leading-[1.05] text-foreground sm:text-6xl lg:text-7xl">
            {follow.hero.line1}
            <br />
            <em className="not-italic text-primary">{follow.hero.line2}</em>
          </h1>
          <p className="mt-lg max-w-md text-lg leading-relaxed text-muted-foreground">{follow.hero.sub}</p>
          <div className="mt-xl flex flex-wrap items-center gap-base">
            <Button asChild size="lg" className="rounded-full px-8">
              <a href={APP_URL}>{follow.hero.cta}</a>
            </Button>
            <a href="#how-it-works" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
              {follow.hero.hint} ↓
            </a>
          </div>
        </div>
        <div className="order-1 flex justify-center lg:order-2">
          <div className="echo-breathe">
            <Echo face="sealed" size={260} uid="hero" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 2. It notices you ─────────────────────────────────────────────────────── */

function Notices() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.6);
  return (
    <Section id="how-it-works">
      <div ref={ref} className="grid items-center gap-xl lg:grid-cols-2">
        <div className="flex justify-center">
          <Echo face={seen ? 'calling' : 'sealed'} size={200} gaze={seen ? 0 : 24} uid="notice" />
        </div>
        <Reveal>
          <p className={kicker}>{follow.notices.kicker}</p>
          <h2 className={h2}>{follow.notices.title}</h2>
          <p className="mt-lg max-w-md leading-relaxed text-muted-foreground">{follow.notices.body}</p>
        </Reveal>
      </div>
    </Section>
  );
}

/* ── 3. Sync, and it plays ─────────────────────────────────────────────────── */

function Sync() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'armed' | 'playing' | 'paused' | 'heard'>('armed');
  const [t, setT] = useState(0);
  const { sample } = follow;
  const line = sample.lines.reduce((at, l, i) => (t >= l.at ? i : at), 0);

  // Sound only ever starts from this tap, and the file only downloads then.
  const press = () => {
    let el = audio.current;
    if (!el) {
      el = new Audio(sample.src);
      el.ontimeupdate = () => setT(el!.currentTime);
      el.onended = () => setState('heard');
      audio.current = el;
    }
    if (state === 'playing') {
      el.pause();
      setState('paused');
      return;
    }
    if (state === 'heard') el.currentTime = 0;
    void el.play().then(() => setState('playing')).catch(() => setState('armed'));
  };
  useEffect(() => () => audio.current?.pause(), []);

  const face: EchoFace = state === 'playing' ? 'playing' : state === 'heard' ? 'heard' : 'armed';
  const label =
    state === 'playing' ? follow.sync.pause : state === 'paused' ? follow.sync.resume : state === 'heard' ? follow.sync.again : follow.sync.tap;

  return (
    <Section className="bg-gradient-to-b from-transparent via-primary/5 to-transparent">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className={kicker}>{follow.sync.kicker}</p>
        <h2 className={h2}>{follow.sync.title}</h2>
        <p className="mt-lg leading-relaxed text-muted-foreground">{follow.sync.body}</p>
      </Reveal>
      <div className="mt-xl flex flex-col items-center">
        <button
          onClick={press}
          className={`echo-press rounded-full ${state === 'armed' ? 'echo-press-armed' : ''}`}
          aria-label={`${label}: ${sample.title}`}
        >
          <Echo face={face} size={180} uid="sync" />
        </button>
        <p className="mt-base font-mono text-xs uppercase tracking-[0.2em] text-primary">{label}</p>
        <p className="mt-2 text-center text-lg text-foreground">{sample.title}</p>
        <p className="text-center text-sm text-muted-foreground">{sample.place}</p>
        {state !== 'armed' && (
          <p className="mt-lg min-h-[4.5rem] max-w-xl text-center text-xl leading-relaxed text-foreground" aria-live="polite">
            {sample.lines[line]?.text}
          </p>
        )}
      </div>
    </Section>
  );
}

/* ── 4 to 7: where, what, price, go ────────────────────────────────────────── */

function Where() {
  return (
    <Section id="where">
      <Reveal>
        <p className={kicker}>{follow.where.kicker}</p>
        <h2 className={h2}>{follow.where.title}</h2>
      </Reveal>
      <div className="mt-xl grid gap-base md:grid-cols-3">
        {follow.where.places.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.08}>
            <div className="flex h-full items-start gap-base rounded-xl border border-border bg-card p-lg">
              <Echo face="calling" size={44} uid={`where-${i}`} />
              <div>
                <h3 className="font-heading text-2xl text-foreground">{p.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.detail}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Kinds() {
  return (
    <Section id="echoes">
      <Reveal className="max-w-2xl">
        <p className={kicker}>{follow.kinds.kicker}</p>
        <p className="mt-base text-2xl leading-snug text-foreground">{follow.kinds.line}</p>
        <div className="mt-lg flex flex-wrap gap-2">
          {follow.kinds.chips.map((c) => (
            <span key={c} className="rounded-full border border-border px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {c}
            </span>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

function Pricing() {
  const p = home.pricing;
  return (
    <Section id="pricing">
      <Reveal className="max-w-2xl">
        <p className={kicker}>{p.kicker}</p>
        <h2 className={h2}>{p.title}</h2>
        <p className="mt-lg leading-relaxed text-muted-foreground">{p.intro}</p>
      </Reveal>
      <div className="mt-xl grid gap-base md:grid-cols-3">
        {p.plans.map((plan) => (
          <div
            key={plan.id}
            className={'rounded-xl border p-lg ' + ('featured' in plan && plan.featured ? 'border-primary/60 bg-primary/10' : 'border-border bg-card')}
          >
            <h3 className="font-heading text-2xl text-foreground">{plan.name}</h3>
            <p className="mt-base">
              <span className="font-heading text-4xl text-foreground">{plan.price}</span>{' '}
              <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">{plan.per}</span>
            </p>
            <p className="mt-base text-sm leading-relaxed text-muted-foreground">{plan.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-lg text-sm text-muted-foreground">
        {p.note} Questions?{' '}
        <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
    </Section>
  );
}

function Go() {
  return (
    <Section className="pb-xxxl text-center">
      <div className="flex flex-col items-center">
        <div className="echo-breathe">
          <Echo face="calling" size={140} uid="go" />
        </div>
        <h2 className="mt-lg font-heading text-5xl text-foreground sm:text-6xl">{follow.go.title}</h2>
        <p className="mt-base text-lg text-muted-foreground">{follow.go.sub}</p>
        <Button asChild size="lg" className="mt-xl rounded-full px-10">
          <a href={APP_URL}>{follow.go.cta}</a>
        </Button>
        <Link to="/partners" className="mt-lg text-sm text-muted-foreground underline hover:text-foreground">
          {follow.go.partners} →
        </Link>
      </div>
    </Section>
  );
}
