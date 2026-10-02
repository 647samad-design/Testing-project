/**
 * Pulls a 5-digit US ZIP out of what the voter typed: "32034", " 32034 ",
 * "32034-1234", or an address ending in a ZIP. Returns null when there isn't
 * one -- previously "abcde", "123" or "00000" were accepted and produced a
 * made-up sample ballot.
 */
export function extractZip(input: string): string | null {
  const m = input.trim().match(/(?:^|\D)(\d{5})(?:-\d{4})?\s*$/) ?? input.trim().match(/^(\d{5})(?:-\d{4})?$/);
  const zip = m?.[1] ?? null;
  if (!zip || zip === '00000') return null;
  return zip;
}

export const INVALID_ZIP_MESSAGE = 'Please enter a valid 5-digit ZIP code.';
