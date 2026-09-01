/* ============================================================
   CURRENCY CONVERSION — live exchange rates, base currency PKR.
   Used by pricing.js to convert a product's PKR price into whatever
   currency a visitor's country uses, when no manual price override
   exists for that country (see product_price_overrides table).

   Uses open.er-api.com — a free, keyless exchange-rate API (150+
   currencies including PKR, updated daily). No account/API key needed,
   which is why it was picked over paid options.

   Rates are cached in memory and refreshed at most once every 6 hours —
   exchange rates don't need per-request freshness, and this keeps
   every product/category page load from hitting the external API.
   ============================================================ */

const RATES_URL = "https://open.er-api.com/v6/latest/PKR";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cachedRates = null;
let cachedAt = 0;
let inFlightFetch = null;

async function getRates() {
    const isFresh = cachedRates && (Date.now() - cachedAt) < CACHE_TTL_MS;
    if (isFresh) return cachedRates;

    // If a refresh is already in progress, reuse it instead of firing a
    // second request when several product requests land at once.
    if (inFlightFetch) return inFlightFetch;

    inFlightFetch = (async () => {
        try {
            const response = await fetch(RATES_URL);
            const data = await response.json();

            if (data.result !== "success" || !data.rates) {
                throw new Error("Exchange rate API returned an unexpected response");
            }

            cachedRates = data.rates; // { PKR: 1, GBP: 0.0028, USD: 0.0036, ... }
            cachedAt = Date.now();
            return cachedRates;

        } catch (error) {
            console.error("[currency] Failed to fetch exchange rates:", error.message);

            // Serve stale rates rather than nothing, if we have any —
            // slightly outdated pricing beats broken pricing.
            if (cachedRates) return cachedRates;

            throw error;

        } finally {
            inFlightFetch = null;
        }
    })();

    return inFlightFetch;
}

// amount is in PKR. Returns null (never throws) if the target currency
// is unknown or rates couldn't be fetched — callers should fall back to
// showing the PKR price when this happens.
async function convertFromPKR(amount, targetCurrency) {
    if (amount == null) return null;
    if (!targetCurrency || targetCurrency === "PKR") return Number(amount);

    try {
        const rates = await getRates();
        const rate = rates[targetCurrency];
        if (!rate) return null;

        return Number(amount) * rate;

    } catch (error) {
        return null;
    }
}

module.exports = { getRates, convertFromPKR };
