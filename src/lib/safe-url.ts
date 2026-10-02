/**
 * Returns the URL only if it's safe to put in an href: http(s) or mailto.
 * Anything else -- javascript:, data:, vbscript:, relative junk -- returns
 * undefined, so the link renders without a destination instead of running code.
 *
 * Many links show URLs that users submit (community fact-check evidence,
 * candidate websites, event links, feed post links, ad destinations). React 18
 * still allows javascript: hrefs. They currently all open with
 * target="_blank" rel="noopener", which happens to keep such code away from the
 * page (verified in a browser), but that shouldn't be the only line of defense.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  let trimmed = url.trim();
  // A bare domain ("www.campaign.com", "campaign.org/about") was a broken
  // relative link; treat it as https.
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(trimmed)) trimmed = `https://${trimmed}`;
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
