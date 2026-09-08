/* ============================================================
   ADD: store_id on products, categories, orders
   One-time script — the "later step" add-roles-permissions.js talks
   about: that migration only set up admin login/access per store
   (stores table + admin_users.role/store_id). This one actually scopes
   the storefront data itself, so Signeon and Vintage Artisans stop
   sharing one undivided product/category/order list.

   Every EXISTING row (products, categories, orders) is backfilled to
   the 'vintage' store — nothing currently live changes behavior, it's
   just now explicit about which store it belongs to. Signeon starts
   with zero rows, ready for its own catalog to be added later.

   Safe to re-run — every statement is IF NOT EXISTS, and the backfill
   UPDATEs only touch rows where store_id IS NULL.

   Usage (from the backend/ folder):
       node add-store-scoping.js --env-file=.env.production
   ============================================================ */

const envFileArg = process.argv.slice(2).find(arg => arg.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.split("=")[1] : ".env";
require("dotenv").config({ path: envFile });

const pool = require("./db");

async function main() {
    console.log(`Using env file: ${envFile}`);
    console.log(`Target database host: "${process.env.DB_HOST}"\n`);

    try {
        const storesCheck = await pool.query(`SELECT id, slug FROM stores ORDER BY id`);
        if (storesCheck.rows.length === 0) {
            throw new Error(
                "No rows in `stores` — run add-roles-permissions.js against this " +
                "database first (it creates + seeds the stores table)."
            );
        }
        console.log("Stores found:", storesCheck.rows.map(r => r.slug).join(", "));

        for (const table of ["products", "categories", "orders"]) {
            await pool.query(`
                ALTER TABLE ${table}
                ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id)
            `);
            console.log(`${table}.store_id ready.`);
        }

        for (const table of ["products", "categories", "orders"]) {
            const result = await pool.query(`
                UPDATE ${table}
                SET store_id = (SELECT id FROM stores WHERE slug = 'vintage')
                WHERE store_id IS NULL
            `);
            console.log(`${table}: backfilled ${result.rowCount} row(s) to the Vintage store.`);
        }

        console.log("\nDone.");

    } catch (error) {
        console.error("Failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
