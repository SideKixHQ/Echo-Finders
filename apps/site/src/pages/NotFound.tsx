import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { ContourLines, WaypointPin } from '@/components/Decor';
import { usePageHead } from '@/lib/head';

export default function NotFoundPage() {
  usePageHead('Page not found · Echo Finders', 'https://echofinders.com/');
  return (
    <main className="relative flex min-h-[80vh] items-center justify-center overflow-hidden px-4 pt-24 text-center">
      <ContourLines className="pointer-events-none absolute inset-0 h-full w-full text-border opacity-40" />
      <div className="relative max-w-xl">
        <WaypointPin className="mx-auto" />
        <p className="mt-lg font-mono text-xs uppercase tracking-[0.25em] text-primary">404 · Off the map</p>
        <h1 className="mt-base font-heading text-4xl text-foreground sm:text-5xl">No Echo here.</h1>
        <p className="mt-base leading-relaxed text-muted-foreground">
          The page you're looking for doesn't exist or has moved.
        </p>
        <Button asChild size="lg" className="mt-xl rounded-full px-8">
          <Link to="/">Back to the start</Link>
        </Button>
      </div>
    </main>
  );
}
