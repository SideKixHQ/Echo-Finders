import { useEffect, useState } from 'react';
import { APP_URL } from '@/content';
import { Link } from 'react-router';
import { Menu, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#echoes', label: 'Echoes' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/partners', label: 'Partners' },
];

/** Transparent over the hero, fading to a solid dark surface on scroll. */
export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const solid = scrolled || open;

  return (
    <header
      className={
        'fixed inset-x-0 top-0 z-50 transition-colors duration-200 ' +
        (solid ? 'border-b border-border bg-background/85 backdrop-blur-md' : 'border-b border-transparent bg-transparent')
      }
    >
      <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between gap-base px-4 sm:px-6 md:h-20 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center" aria-label="Echo Finders home">
          <img
            src="/logo.webp"
            alt="Echo Finders"
            width={367}
            height={96}
            className="block h-9 w-auto max-w-full object-contain md:h-11"
          />
        </Link>

        <nav className="hidden items-center gap-lg lg:flex" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-150 hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
          <Button asChild size="sm" className="ml-2 rounded-full px-5">
            <a href={APP_URL}>Get the app</a>
          </Button>
        </nav>

        <button
          onClick={() => setOpen(!open)}
          className="rounded-md p-2 text-foreground transition-colors duration-150 hover:bg-muted lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur-md lg:hidden">
          <nav className="mx-auto flex w-full max-w-content flex-col gap-1 px-4 py-4 sm:px-6" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Button asChild className="mt-2 rounded-full">
              <a href={APP_URL} onClick={() => setOpen(false)}>
                Get the app
              </a>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
