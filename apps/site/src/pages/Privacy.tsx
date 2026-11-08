import { marked } from 'marked';

import { usePageHead } from '@/lib/head';
// The policy itself, from the repo's one copy, so the page and the document can never
// disagree. Changing docs/privacy-policy.md and merging is how the page changes.
import policy from '../../../../docs/privacy-policy.md?raw';

// Our own text, written in this repo: safe to render as HTML.
const html = marked.parse(policy, { async: false }) as string;

export default function PrivacyPage() {
  usePageHead(
    'Privacy policy — Echo Finders',
    'https://echofinders.com/privacy',
    'What Echo Finders collects, why, and how to turn each part off.',
  );
  return (
    <main className="relative px-4 pb-xxxl pt-32 sm:px-6 lg:px-8">
      <article className="policy mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
