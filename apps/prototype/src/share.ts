/**
 * Share, with the two fallbacks a browser needs.
 *
 * `navigator.share` is the right thing on a phone and does not exist on most desktops; the
 * clipboard is the right thing there and is refused outside a secure context. Past both,
 * do nothing quietly rather than throwing — a share that fails is not worth an error, and
 * a dismissed native sheet is usually somebody changing their mind.
 *
 * Shared between the card and the end-of-journey screen, because the end-of-journey Share
 * button had no handler at all and the card already had this written inside it.
 */
export async function shareText(title: string, text: string, url?: string): Promise<void> {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(url ? { title, text, url } : { title, text });
      return;
    }
    await navigator.clipboard?.writeText(url ? `${text} ${url}` : text);
  } catch {
    /* Cancelled, or no clipboard. Neither is worth interrupting a walk for. */
  }
}

/** The address `?echo=` reads: where a shared story is found. */
const PARAM = "echo";

/**
 * A link that opens one echo for whoever it is sent to (`takeSharedEcho`). The address of
 * the app with the echo's id on it, so it works wherever the app is served from.
 */
export function echoLink(echoId: string): string {
  return `${window.location.origin}/?${PARAM}=${encodeURIComponent(echoId)}`;
}

/**
 * The echo a shared link asked for, read once on load.
 *
 * The id is taken off the address straight away, like the owner code, so a reload or a
 * bookmark does not keep reopening it. Only an id the library knows comes back; anything
 * else is a stale or mistyped link and the app simply opens as usual.
 */
export function takeSharedEcho(known: (id: string) => boolean): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get(PARAM);
  if (id === null) return null;
  params.delete(PARAM);
  const rest = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  return known(id) ? id : null;
}
