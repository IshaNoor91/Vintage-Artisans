/* ============================================================
   FIX: products.id has no auto-increment
   One-time script. The `products` table was originally filled by
   importing WordPress/WooCommerce products with their own explicit
   IDs (e.g. 60290, 60334...) — so the `id` column was never given a
   sequence/default. That's fine for those 358 imported rows, but it
   means creating a NEW product from the admin panel fails, because
   Postgres has no way to generate the next id on its own.

   This script:
     1. Creates a sequence for products.id (if it doesn't exist yet)
     2. Points that sequence to start above the highest existing id,
        so new products can't collide with an imported WooCommerce id
     3. Sets that sequence as the default for products.id

   Safe to re-run — every step uses IF NOT EXISTS / is idempotent.

   Usage (from the backend/ folder):
       node fix-products-id-sequence.js                     (uses .env — your LOCAL db)
       node fix-products-id-sequence.js --env-file=.env.production   (production db)
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";

require("dotenv").config({ path: envFile });

const pool = require("./db");

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS products_id_seq`);
        console.log("Sequence products_id_seq ready.");

        const { rows } = await pool.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM products`);
        const maxId = rows[0].max_id;

        await pool.query(`SELECT setval('products_id_seq', $1)`, [maxId]);
        console.log(`Sequence set to start after the highest existing product id (${maxId}).`);

        await pool.query(
            `ALTER TABLE products ALTER COLUMN id SET DEFAULT nextval('products_id_seq')`
        );
        console.log("products.id now defaults to the next sequence value.");

        await pool.query(`ALTER SEQUENCE products_id_seq OWNED BY products.id`);

        console.log("\nDone — creating a new product from the admin panel should work now.");

    } catch (error) {
        console.error("Fix failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
