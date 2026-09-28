/**
 * Quotes a value for use inside a PostgREST `.or()` / filter string.
 *
 * `.or()` takes a raw string like `title.ilike.%foo%,publisher.ilike.%foo%`,
 * where `,` separates conditions and `(`, `)` group them. Interpolating user
 * text directly means a search for "Miami, FL" splits into a broken second
 * condition and the request fails, and crafted input could add conditions.
 * PostgREST accepts double-quoted values, with `\` and `"` backslash-escaped.
 */
export function pgrstQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
