/* ============================================================
   ADD: shipping_countries table
   One-time script.

   Makes "which countries can a customer ship to" admin-configurable
   instead of hardcoded in JS/checkout.js. Creates a shipping_countries
   table (name, ISO code, enabled) and seeds it from country-codes.js —
   every country the ShipStation integration already knows how to map
   to a code, so the admin can turn any of them on later without a
   developer touching code.

   Only Pakistan + United Kingdom start enabled — this matches exactly
   what checkout.js currently offers, so running this script changes
   nothing about what customers see until someone enables more
   countries from Admin -> Shipping Countries.

   Safe to re-run — CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT
   DO NOTHING mean it never touches a row that already exists, so
   re-running this later never undoes any checkbox the admin panel set.

   Usage (from the backend/ folder):
       node add-shipping-countries-table.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const pool = require("./db");
const countryCodes = require("./country-codes");

// Matches what JS/checkout.js currently offers. Everything else starts
// disabled — enable more from Admin -> Shipping Countries whenever ready.
const INITIALLY_ENABLED = ["Pakistan", "United Kingdom"];

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shipping_countries (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                code VARCHAR(2) NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT false
            )
        `);
        console.log("shipping_countries table ready.\n");

        let created = 0;
        let skipped = 0;

        for (const [name, code] of Object.entries(countryCodes)) {
            const enabled = INITIALLY_ENABLED.includes(name);

            const result = await pool.query(
                `
                INSERT INTO shipping_countries (name, code, enabled)
                VALUES ($1, $2, $3)
                ON CONFLICT (name) DO NOTHING
                RETURNING id
                `,
                [name, code, enabled]
            );

            if (result.rows.length > 0) {
                created++;
            } else {
                skipped++;
            }
        }

        console.log(`Done. Created: ${created}, Skipped (already existed): ${skipped}.`);
        console.log(`Enabled at start: ${INITIALLY_ENABLED.join(", ")}.`);

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
