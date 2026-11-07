import { Link } from 'react-router';

import { ContourLines } from '@/components/Decor';

const columns = [
  {
    title: 'Explore',
    span: 'md:col-span-2',
    links: [
      { to: '/#how-it-works', label: 'How it works' },
      { to: '/#echoes', label: 'Echo categories' },
      { to: '/#cape-fear', label: 'Cape Fear region' },
      { to: '/#pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Partners',
    span: 'md:col-span-2',
    links: [
      { to: '/partners', label: 'Partner with us' },
      { to: '/partners', label: 'Destination passes' },
      { to: '/partners', label: 'Sponsorships' },
    ],
  },
  {
    title: 'Company',
    span: 'md:col-span-3',
    links: [
      { to: '/#cape-fear', label: 'Where we begin' },
      { to: '/partners', label: 'Work with us' },
      { to: 'mailto:hello@echofinders.com', label: 'Contact' },
    ],
  },
];

/** Styled like the legend of an expedition map. */
export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-background">
      <ContourLines className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px] w-full text-border opacity-30" />

      <div className="relative mx-auto w-full max-w-content px-4 py-xxl sm:px-6 lg:px-8">
        <div className="grid gap-xl md:grid-cols-12">
          <div className="md:col-span-5">
            <Link to="/" aria-label="Echo Finders home" className="inline-flex">
              <img src="/logo.webp" alt="Echo Finders" width={367} height={96} loading="lazy" className="block h-10 w-auto object-contain" />
            </Link>
            <p className="mt-base max-w-sm text-sm leading-relaxed text-muted-foreground">
              Short, location-triggered audio stories that reveal the people, events, and mysteries that give a place
              its character.
            </p>
            <p className="mt-lg font-mono text-[11px] uppercase tracking-[0.18em] text-primary">34.2257° N · 77.9447° W</p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} className={col.span} aria-label={`Footer ${col.title.toLowerCase()} links`}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">{col.title}</h3>
              <ul className="mt-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="block py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {col.title === 'Company' && (
                <p className="mt-lg text-xs leading-relaxed text-muted-foreground">
                  Starting in the Cape Fear region —
                  <br />
                  Wilmington, North Carolina.
                </p>
              )}
            </nav>
          ))}
        </div>

        <div className="mt-xxl flex flex-col items-start justify-between gap-4 border-t border-border pt-lg sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Echo Finders. All rights reserved.</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Stand where it happened · Hear the Echo
          </p>
        </div>
      </div>
    </footer>
  );
}
