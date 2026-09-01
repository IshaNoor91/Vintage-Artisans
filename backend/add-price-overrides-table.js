/* ============================================================
   ADD: product_price_overrides table
   One-time script.

   Lets the admin set a manual, fixed price for a specific product in
   a specific country (e.g. a product is Rs. 5000 in Pakistan, but the
   admin wants to show exactly £45 in the UK instead of whatever the
   live currency conversion would work out to). When no override
   exists for a product+country, the storefront falls back to
   converting the Pakistan price using live exchange rates — see
   pricing.js and currency.js.

   One row per (product, country) pair — country_code is the 2-letter
   ISO code (matches shipping_countries.code / country-codes.js).

   Safe to re-run — CREATE TABLE IF NOT EXISTS only creates it once.

   Usage (from the backend/ folder):
       node add-price-overrides-table.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const pool = require("./db");

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_price_overrides (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                country_code VARCHAR(2) NOT NULL,
                regular_price NUMERIC(10, 2) NOT NULL,
                sale_price NUMERIC(10, 2),
                UNIQUE(product_id, country_code)
            )
        `);
        console.log("product_price_overrides table ready.");

        console.log("\nDone.");

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
