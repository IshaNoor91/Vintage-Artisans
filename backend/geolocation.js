/* ============================================================
   IP -> COUNTRY — detects which country a visitor is browsing from,
   from their IP address, so pricing.js knows which currency/price to
   show them without asking.

   Uses geojs.io — a free, keyless IP geolocation API (HTTPS, no
   account needed). Results are cached in memory per IP for 12 hours,
   since a visitor's country doesn't change between page loads and
   this avoids hitting the external API on every single request.
   ============================================================ */

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const cache = new Map(); // ip -> { countryCode, expiresAt }

// Railway (like most hosts) sits behind a proxy, so the visitor's real
// IP is in the X-Forwarded-For header, not the raw socket address.
function getClientIP(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    return req.socket && req.socket.remoteAddress;
}

// Returns a 2-letter ISO country code (e.g. "GB"), or null if the IP
// couldn't be resolved (private/local IP during local development,
// lookup failure, etc.) — callers should fall back to the base
// currency (PKR) when this happens, never throw.
async function getCountryFromIP(ip) {
    if (!ip || isPrivateIP(ip)) return null;

    const cached = cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.countryCode;
    }

    try {
        const response = await fetch(
            `https://get.geojs.io/v1/ip/country.json?ip=${encodeURIComponent(ip)}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const countryCode = data && data.country ? data.country : null;

        cache.set(ip, { countryCode, expiresAt: Date.now() + CACHE_TTL_MS });
        return countryCode;

    } catch (error) {
        console.error(`[geolocation] Failed to resolve IP ${ip}:`, error.message);
        return null;
    }
}

// localhost / private network ranges — geolocation APIs can't resolve
// these (relevant during local Live Server testing).
function isPrivateIP(ip) {
    return (
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("172.16.") ||
        ip === "::ffff:127.0.0.1"
    );
}

module.exports = { getClientIP, getCountryFromIP };
