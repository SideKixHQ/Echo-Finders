import { useEffect } from 'react';

/**
 * Sets the page's title, description and canonical link in <head>.
 *
 * The site runs on React 18 to share one React with the app in this workspace; React 19
 * would hoist <title> and <meta> written inside a page, React 18 leaves them in the body.
 */
export function usePageHead(title: string, canonical: string, description?: string) {
  useEffect(() => {
    document.title = title;
    setTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).setAttribute('href', canonical);
    if (description) {
      setTag('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' })).setAttribute(
        'content',
        description,
      );
    }
  }, [title, canonical, description]);
}

function setTag(selector: string, make: () => HTMLElement): HTMLElement {
  const found = document.head.querySelector<HTMLElement>(selector);
  if (found) return found;
  const el = make();
  document.head.appendChild(el);
  return el;
}
