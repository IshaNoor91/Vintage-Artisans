/* ============================================================
   PRICING — resolves what price/currency to show a visitor based on
   their detected country:

     1. If the admin has set a manual price override for this product
        + this country (product_price_overrides table) -> use it.
     2. Otherwise, convert the product's PKR price into that country's
        currency using live exchange rates (currency.js).
     3. If the country is Pakistan, is undetected, or its currency
        can't be converted for any reason -> fall back to the plain
        PKR price. Pricing should never break a page, worst case it
        just shows PKR instead of the visitor's local currency.
   ============================================================ */

const pool = require("./db");
const countryCurrencies = require("./country-currencies");
const { convertFromPKR } = require("./currency");

function round2(n) {
    return Math.round(n * 100) / 100;
}

function basePriceOf(product) {
    return {
        regular_price: product.regular_price != null ? Number(product.regular_price) : null,
        sale_price: product.sale_price != null ? Number(product.sale_price) : null,
        currency: "PKR",
        price_source: "base"
    };
}

// Fetches any manual overrides for the given product ids + country in
// one query. Returns a Map keyed by product_id.
async function getOverrideMap(productIds, countryCode) {
    const map = new Map();
    if (!countryCode || !productIds || productIds.length === 0) return map;

    const result = await pool.query(
        `
        SELECT product_id, regular_price, sale_price
        FROM product_price_overrides
        WHERE country_code = $1 AND product_id = ANY($2::int[])
        `,
        [countryCode, productIds]
    );

    result.rows.forEach(row => map.set(row.product_id, row));
    return map;
}

// product: a row with regular_price/sale_price (in PKR).
// countryCode: 2-letter ISO code, or null/undefined if undetected.
// overrideRow: optional pre-fetched row from product_price_overrides.
async function resolveProductPrice(product, countryCode, overrideRow) {
    if (!countryCode || countryCode === "PK") {
        return basePriceOf(product);
    }

    if (overrideRow) {
        return {
            regular_price: overrideRow.regular_price != null ? Number(overrideRow.regular_price) : null,
            sale_price: overrideRow.sale_price != null ? Number(overrideRow.sale_price) : null,
            currency: countryCurrencies[countryCode] || "PKR",
            price_source: "override"
        };
    }

    const targetCurrency = countryCurrencies[countryCode];
    if (!targetCurrency || targetCurrency === "PKR") {
        return basePriceOf(product);
    }

    const [regularConverted, saleConverted] = await Promise.all([
        product.regular_price != null ? convertFromPKR(product.regular_price, targetCurrency) : Promise.resolve(null),
        product.sale_price != null ? convertFromPKR(product.sale_price, targetCurrency) : Promise.resolve(null)
    ]);

    // Conversion failed entirely (rates unavailable, unknown currency) —
    // fall back to PKR rather than showing nothing.
    if (regularConverted == null && saleConverted == null && (product.regular_price != null || product.sale_price != null)) {
        return basePriceOf(product);
    }

    return {
        regular_price: regularConverted != null ? round2(regularConverted) : null,
        sale_price: saleConverted != null ? round2(saleConverted) : null,
        currency: targetCurrency,
        price_source: "converted"
    };
}

// Resolves prices for a whole list of products in one go — one override
// query total, rates fetched/cached once (currency.js caches internally).
async function resolveProductPrices(products, countryCode) {
    const productIds = products.map(p => p.id);
    const overrides = await getOverrideMap(productIds, countryCode);

    return Promise.all(
        products.map(async product => {
            const resolved = await resolveProductPrice(product, countryCode, overrides.get(product.id));
            return {
                ...product,
                regular_price: resolved.regular_price,
                sale_price: resolved.sale_price,
                currency: resolved.currency,
                price_source: resolved.price_source
            };
        })
    );
}

module.exports = { resolveProductPrice, resolveProductPrices, getOverrideMap, round2 };
