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
export async function shareText(title: string, text: string): Promise<void> {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title, text });
      return;
    }
    await navigator.clipboard?.writeText(text);
  } catch {
    /* Cancelled, or no clipboard. Neither is worth interrupting a walk for. */
  }
}
