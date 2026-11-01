/**
 * Pack-balance threshold (in pollen) at or below which auto top-up triggers.
 * Enter is the authoritative service for this check before Stripe is touched.
 */
export const AUTO_TOP_UP_THRESHOLD_POLLEN = 5;

/**
 * Without auto top-up, Enter emails the user once their pack balance drops
 * below this share of their last pack (user.last_pack_pollen).
 */
export const LOW_BALANCE_SHARE = 0.2;

export const AUTO_TOP_UP_PACK_MIN_USD = 5;
export const AUTO_TOP_UP_PACK_MAX_USD = 100;
