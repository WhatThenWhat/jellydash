export type Rating = { id: string; label: string; value: string };

// Ratings are label/value pairs, but Jellyfin's MaxParentalRating is a plain number. Values like
// "M/16" carry that number in the string, so it is pulled out instead of keeping a second field.
export function extractRatingNumber(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}
