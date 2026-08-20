// Channel definitions and visibility.
//
// Every message belongs to exactly one channel, and the channel alone decides
// who can see it. Visibility is computed here and nowhere else, so the hard
// invariant - no consultation content ever crosses between countries - has a
// single place to be right and a single place to test.
//
// Nothing here routes by seat id. Routing keys off `level` and `country`.

export const TABLE = "table";
export const PRIVATE = "private";
export const consultChannel = (country) => `consult:${country}`;

export const isConsult = (channel) => String(channel || "").startsWith("consult:");
export const consultCountry = (channel) => (isConsult(channel) ? channel.slice("consult:".length) : null);

export const postSeats = (pack) => pack.seats.filter((s) => s.level === "post");
export const capitalSeats = (pack) => pack.seats.filter((s) => s.level === "capital");
export const seatsOfCountry = (pack, country) => pack.seats.filter((s) => s.country === country);

/** The post seat for a country. One per country by construction. */
export const postFor = (pack, country) =>
  pack.seats.find((s) => s.country === country && s.level === "post");

/** The capital seat for a country. */
export const capitalFor = (pack, country) =>
  pack.seats.find((s) => s.country === country && s.level === "capital");

/** The co-national - same country, other seat. */
export const coNational = (pack, seat) =>
  pack.seats.find((s) => s.country === seat.country && s.id !== seat.id);

export const countries = (pack) => [...new Set(pack.seats.map((s) => s.country))];

/**
 * Which seats may see a message on this channel. Computed, never asserted.
 * @returns {string[]} seat ids
 */
export function visibleTo(pack, channel) {
  if (channel === PRIVATE) return [];

  if (channel === TABLE) {
    const seats = postSeats(pack);
    // Section 10.1: capital seats may read the table but never speak into it.
    const readers = pack.capitalSeesTable ? capitalSeats(pack) : [];
    return [...seats, ...readers].map((s) => s.id);
  }

  if (isConsult(channel)) {
    return seatsOfCountry(pack, consultCountry(channel)).map((s) => s.id);
  }

  throw new Error(`Unknown channel: ${channel}`);
}

/** May this seat speak on this channel? */
export function canSpeak(pack, seat, channel) {
  if (channel === PRIVATE) return true;
  if (channel === TABLE) return seat.level === "post";
  if (isConsult(channel)) return seat.country === consultCountry(channel);
  return false;
}

/**
 * Filter a message history down to what one seat may see.
 * This is the function that keeps consult:eu out of UK prompts.
 */
export function historyFor(pack, messages, seat) {
  return messages.filter((m) => visibleTo(pack, m.channel).includes(seat.id));
}
