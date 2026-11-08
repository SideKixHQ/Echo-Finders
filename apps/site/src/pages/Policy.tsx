import { marked } from 'marked';

import { usePageHead } from '@/lib/head';
// Each policy from the repo's one copy, so a page and its document can never disagree.
// Changing the file in docs/ and merging is how the page changes.
import privacy from '../../../../docs/privacy-policy.md?raw';
import terms from '../../../../docs/terms-of-service.md?raw';
import refunds from '../../../../docs/refund-policy.md?raw';

/**
 * The documents link to each other by file name, which is right in the repo and a dead link
 * on the site. Here they become the site's own addresses.
 */
const SITE_LINKS: Record<string, string> = {
  'privacy-policy.md': '/privacy',
  'terms-of-service.md': '/terms',
  'refund-policy.md': '/refunds',
};

function toHtml(markdown: string): string {
  const linked = markdown.replace(/\]\(([a-z-]+\.md)\)/g, (whole, file: string) =>
    SITE_LINKS[file] ? `](${SITE_LINKS[file]})` : whole,
  );
  // Our own text, written in this repo: safe to render as HTML.
  return marked.parse(linked, { async: false }) as string;
}

const PAGES = {
  privacy: {
    html: toHtml(privacy),
    title: 'Privacy policy — Echo Finders',
    url: 'https://echofinders.com/privacy',
    description: 'What Echo Finders collects, why, and how to turn each part off.',
  },
  terms: {
    html: toHtml(terms),
    title: 'Terms of service — Echo Finders',
    url: 'https://echofinders.com/terms',
    description: 'The agreement between you and Echo Finders: passes, renewals, safety and accuracy.',
  },
  refunds: {
    html: toHtml(refunds),
    title: 'Refund policy — Echo Finders',
    url: 'https://echofinders.com/refunds',
    description: 'When Echo Finders refunds a pass, and how to ask.',
  },
} as const;

export default function PolicyPage({ which }: { which: keyof typeof PAGES }) {
  const page = PAGES[which];
  usePageHead(page.title, page.url, page.description);
  return (
    <main className="relative px-4 pb-xxxl pt-32 sm:px-6 lg:px-8">
      <article className="policy mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: page.html }} />
    </main>
  );
}
