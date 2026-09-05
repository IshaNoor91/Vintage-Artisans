/* ============================================================
   ADD: payment_methods table
   One-time script.

   Makes "which payment methods appear at checkout" admin-configurable
   instead of hardcoded in JS/checkout.js — same pattern as
   add-shipping-countries-table.js. Creates a payment_methods table
   (key, label, country_only, enabled, sort_order) and seeds it with
   the methods checkout.js already offers today.

   country_only marks a method as available only when the order's
   shipping country matches exactly (used for local mobile wallets
   like Easypaisa / JazzCash, which only make sense for Pakistan).
   NULL means "available for every shipping country".

   Every method starts enabled — running this script changes nothing
   about what customers see until someone unchecks one from
   Admin -> Payment Methods.

   Safe to re-run — CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT
   DO NOTHING mean it never touches a row that already exists.

   Usage (from the backend/ folder):
       node add-payment-methods-table.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const pool = require("./db");

// [key, label, country_only, sort_order] — matches what checkout.js
// currently offers, in the order they should appear.
const METHODS = [
    ["cod", "Cash on Delivery", null, 1],
    ["stripe", "Pay with Card (Stripe)", null, 2],
    ["easypaisa", "Easypaisa", "Pakistan", 3],
    ["jazzcash", "JazzCash", "Pakistan", 4],
    ["bank_transfer", "Bank Transfer", null, 5]
];

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payment_methods (
                id SERIAL PRIMARY KEY,
                key VARCHAR(50) UNIQUE NOT NULL,
                label VARCHAR(100) NOT NULL,
                country_only VARCHAR(100),
                enabled BOOLEAN NOT NULL DEFAULT true,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
        `);
        console.log("payment_methods table ready.\n");

        let created = 0;
        let skipped = 0;

        for (const [key, label, countryOnly, sortOrder] of METHODS) {
            const result = await pool.query(
                `
                INSERT INTO payment_methods (key, label, country_only, enabled, sort_order)
                VALUES ($1, $2, $3, true, $4)
                ON CONFLICT (key) DO NOTHING
                RETURNING id
                `,
                [key, label, countryOnly, sortOrder]
            );

            if (result.rows.length > 0) {
                created++;
            } else {
                skipped++;
            }
        }

        console.log(`Done. Created: ${created}, Skipped (already existed): ${skipped}.`);
        console.log(`All methods start enabled — nothing changes for customers until you visit Admin -> Payment Methods.`);

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
