/* ============================================================
   FEATURE FLAGS — simple on/off switches stored in the database
   (feature_flags table) so they can be flipped from Admin -> Settings
   without touching code or waiting for a redeploy. Same "nothing
   hardcoded" rule already used for shipping countries and price
   overrides.

   Cached in memory for a short time so checking a flag doesn't cost
   a database query on every single request (same pattern as
   currency.js / geolocation.js).
   ============================================================ */

const pool = require("./db");

// Known flag keys, in one place, so the backend and the two admin
// endpoints below always agree on the exact string.
const FLAGS = {
    SHIPSTATION_ENABLED: "shipstation_enabled"
};

const CACHE_TTL_MS = 30 * 1000; // 30s — a toggle in the admin panel takes effect almost immediately, without hitting the database on every request.

let cache = null; // { flags: { [key]: boolean }, expiresAt }
let inFlightFetch = null;

async function loadFlags() {
    const result = await pool.query(`SELECT key, enabled FROM feature_flags`);
    const flags = {};
    for (const row of result.rows) {
        flags[row.key] = row.enabled;
    }
    return flags;
}

async function getFlags() {
    if (cache && cache.expiresAt > Date.now()) {
        return cache.flags;
    }

    // Two requests arriving back-to-back while the cache is cold
    // share one query instead of firing two.
    if (inFlightFetch) {
        return inFlightFetch;
    }

    inFlightFetch = loadFlags()
        .then(flags => {
            cache = { flags, expiresAt: Date.now() + CACHE_TTL_MS };
            inFlightFetch = null;
            return flags;
        })
        .catch(error => {
            inFlightFetch = null;
            throw error;
        });

    return inFlightFetch;
}

// Fail-open: a flag that doesn't exist yet (migration not run yet, or
// a brand new flag nobody has touched) or a database hiccup should
// never silently turn a feature off.
async function isFeatureEnabled(key) {
    try {
        const flags = await getFlags();
        return key in flags ? Boolean(flags[key]) : true;
    } catch (error) {
        console.error(`[feature-flags] Failed to check "${key}", defaulting to enabled:`, error.message);
        return true;
    }
}

// For the admin Settings page — every flag that exists in the table.
async function getAllFeatureFlags() {
    const result = await pool.query(
        `SELECT key, enabled, updated_at FROM feature_flags ORDER BY key ASC`
    );
    return result.rows;
}

async function setFeatureFlag(key, enabled) {
    await pool.query(
        `
        INSERT INTO feature_flags (key, enabled, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
        `,
        [key, enabled]
    );

    // Drop the cache so the very next check reflects the change
    // immediately instead of waiting out the TTL.
    cache = null;
}

module.exports = { FLAGS, isFeatureEnabled, getAllFeatureFlags, setFeatureFlag };
